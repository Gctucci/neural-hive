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

async function setup() {
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

  db = await NeuroclawDB.create(dbPath);

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

describe("DreamCycle", () => {
  beforeEach(async () => {
    await setup();
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
    await setup();

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
