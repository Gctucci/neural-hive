import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "@neuroclaw/config";
import { NeuroclawDB, Vault, LocalValenceScorer, EpisodeCapture } from "@neuroclaw/memory";
import { GovernanceGate, AuditTrail } from "@neuroclaw/governance";
import { RuleBasedReasoner } from "../reasoner";
import { DreamCycle } from "../dream";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let configDir: string;
let db: NeuroclawDB;
let vault: Vault;
let capture: EpisodeCapture;
let dream: DreamCycle;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-test-"));
  configDir = path.join(tmpDir, "config");
  fs.mkdirSync(configDir, { recursive: true });

  // Write minimal base.yaml
  fs.writeFileSync(
    path.join(configDir, "base.yaml"),
    `agent:\n  id: test-agent\n  store_path: ${tmpDir}/store\n`,
  );

  const config = loadConfig(configDir);
  const dbPath = path.join(tmpDir, "store", "neuroclaw.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = NeuroclawDB.create(dbPath);

  const vaultRoot = path.join(tmpDir, "vault");
  vault = new Vault(vaultRoot);
  vault.init();

  const scorer = new LocalValenceScorer();
  capture = new EpisodeCapture(db, vault, scorer);

  const gate = new GovernanceGate("autonomous");
  const auditPath = path.join(tmpDir, "audit.md");
  const audit = new AuditTrail(auditPath);
  const reasoner = new RuleBasedReasoner();

  dream = new DreamCycle(db, vault, config, gate, audit, reasoner);
}

function teardown() {
  try {
    db.close();
  } catch {
    // ignore
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DreamCycle forgetting safety nets", () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it("Tier 3: does not archive migration-tagged semantic entries", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000; // 200 days ago
    db.insertSemantic({
      id: "sem-migration",
      domain: "coding-preferences",
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/coding-preferences/sem-migration.md",
      line_range: null,
      half_life: 10,
      retention: 0.01, // way below threshold
      source_episode_ids: "",
      tags: "migration,source:MEMORY.md",
    });
    vault.write(
      "semantic/domains/coding-preferences/sem-migration.md",
      "Important preference"
    );

    await capture.capture({
      sessionId: "s1",
      project: "test",
      interactionText: "Something happened",
      summary: "Work done",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const entry = db.getSemantic("sem-migration");
    expect(entry).not.toBeNull();
  });

  it("Tier 3: does not archive entries in unforgettable_categories domains", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000;
    db.insertSemantic({
      id: "sem-identity",
      domain: "self_model", // unforgettable by default config
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/self_model/sem-identity.md",
      line_range: null,
      half_life: 10,
      retention: 0.01,
      source_episode_ids: "",
      tags: "",
    });
    vault.write("semantic/domains/self_model/sem-identity.md", "Core identity trait");

    await capture.capture({
      sessionId: "s2",
      project: "test",
      interactionText: "Something happened",
      summary: "Work done",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const entry = db.getSemantic("sem-identity");
    expect(entry).not.toBeNull();
  });

  it("Tier 2: merges drop candidate into same-domain survivor before archiving", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000;

    db.insertSemantic({
      id: "sem-survivor",
      domain: "typescript",
      created: now,
      last_accessed: now,
      importance: 0.8,
      ref_count: 5,
      confidence: 0.9,
      file_path: "semantic/domains/typescript/sem-survivor.md",
      line_range: null,
      half_life: 30,
      retention: 0.9,
      source_episode_ids: "",
      tags: "",
    });
    vault.write(
      "semantic/domains/typescript/sem-survivor.md",
      "TypeScript strict mode is preferred"
    );
    db.indexContent("sem-survivor", "semantic", "TypeScript strict mode preferred");

    db.insertSemantic({
      id: "sem-candidate",
      domain: "typescript",
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/typescript/sem-candidate.md",
      line_range: null,
      half_life: 10,
      retention: 0.01,
      source_episode_ids: "",
      tags: "",
    });
    vault.write(
      "semantic/domains/typescript/sem-candidate.md",
      "TypeScript types are useful"
    );

    await capture.capture({
      sessionId: "s3",
      project: "test",
      interactionText: "TypeScript helps catch bugs",
      summary: "TypeScript usage",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const survivorContent = vault.read("semantic/domains/typescript/sem-survivor.md");
    expect(survivorContent).toContain("TypeScript types are useful");
  });

  it("GSEM: decays stale edge weights during dream cycle", async () => {
    const staleTime = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
    db.insertRelation({
      source_id: "sem-x",
      target_id: "sem-y",
      relation_type: "supports",
      weight: 1.0,
      created: staleTime,
      last_used: staleTime,
      provenance: "rule",
      confidence: 1.0,
    });

    await capture.capture({
      sessionId: "s4",
      project: "test",
      interactionText: "Some work done",
      summary: "Work summary",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const rels = db.getRelationsFrom("sem-x");
    if (rels.length > 0) {
      expect(rels[0].weight).toBeLessThan(1.0);
      expect(rels[0].weight).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe("DreamCycle", () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it("returns a minimal report when no episodes are pending", async () => {
    const report = await dream.run();

    expect(report.episodesProcessed).toBe(0);
    expect(report.consolidated).toBe(0);
    expect(report.archived).toBe(0);
    expect(report.hypothesesUpdated).toEqual([]);
  });

  it("processes pending episodes and consolidates them", async () => {
    await capture.capture({
      sessionId: "s1",
      project: "test-project",
      interactionText: "User asked about auth tokens and session management",
      summary: "Discussed authentication token handling",
      isCorrection: false,
      outcomeSignal: 1,
    });

    const report = await dream.run();

    expect(report.episodesProcessed).toBe(1);
    expect(report.consolidated).toBe(1);
    expect(db.getPendingEpisodes()).toHaveLength(0);
  });

  it("creates semantic entries from novel episodes", async () => {
    await capture.capture({
      sessionId: "s1",
      project: "test-project",
      interactionText: "Implemented auth middleware for JWT validation in src/auth/middleware.ts",
      summary: "Built JWT auth middleware for API routes",
      isCorrection: false,
      outcomeSignal: 1,
    });

    await dream.run();

    const authEntries = db.getSemanticByDomain("auth");
    expect(authEntries.length).toBeGreaterThan(0);
  });

  it("writes a dream report to the vault", async () => {
    await capture.capture({
      sessionId: "s1",
      project: "test-project",
      interactionText: "Refactored database connection pooling",
      summary: "Improved database connection handling",
      isCorrection: false,
      outcomeSignal: 0,
    });

    const report = await dream.run();

    expect(report.digestPath).toMatch(/^dreams\/dream-/);
    const content = vault.read(report.digestPath);
    expect(content).not.toBeNull();
    expect(content).toContain("Freshness");
  });

  it("computes health metrics in the report", async () => {
    // Run with no episodes to get the edge-case report
    const emptyReport = await dream.run();
    expect(emptyReport.healthScore).toBeGreaterThanOrEqual(0);
    expect(emptyReport.healthScore).toBeLessThanOrEqual(100);

    // Setup fresh for a real run
    teardown();
    setup();

    await capture.capture({
      sessionId: "s1",
      project: "test-project",
      interactionText: "Updated config parsing logic for better error messages",
      summary: "Improved config error handling",
      isCorrection: false,
      outcomeSignal: 1,
    });

    const report = await dream.run();
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
  });
});
