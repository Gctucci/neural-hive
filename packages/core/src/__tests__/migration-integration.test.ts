import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("Phase 3 Integration: Migration → Search → Dream", () => {
  let tmpDir: string;
  let configDir: string;
  let openclawDir: string;
  let engine: NeuroclawEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3-integration-"));
    configDir = path.join(tmpDir, "config");
    openclawDir = path.join(tmpDir, "openclaw-project");

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(openclawDir, { recursive: true });
    fs.mkdirSync(path.join(openclawDir, "memory"), { recursive: true });

    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: test-agent\n  store_path: ${tmpDir}/store\n`
    );

    fs.writeFileSync(
      path.join(openclawDir, "MEMORY.md"),
      [
        "## TypeScript Preferences",
        "",
        "Use strict mode. Prefer explicit types over inference for public APIs.",
        "",
        "## Testing Strategy",
        "",
        "Write tests before implementation. Use Vitest for unit tests.",
      ].join("\n")
    );

    fs.writeFileSync(
      path.join(openclawDir, "memory", "2026-03-01.md"),
      "Worked on auth module today. Fixed a CORS issue with preflight requests."
    );

    engine = new NeuroclawEngine(configDir);
    await engine.init();
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("migrates MEMORY.md and daily files, then finds them via search", async () => {
    const report = await engine.migrateFromOpenClaw(openclawDir);

    // 2 semantic (MEMORY.md H2 sections) + 1 episodic (daily file)
    expect(report.imported).toBe(3);

    const semanticEntries = report.entries.filter((e) => e.type === "semantic");
    const episodicEntries = report.entries.filter((e) => e.type === "episodic");
    expect(semanticEntries).toHaveLength(2);
    expect(episodicEntries).toHaveLength(1);

    // Should be searchable via FTS
    const tsResults = engine.search("strict mode TypeScript");
    expect(tsResults.length).toBeGreaterThanOrEqual(1);
    expect(tsResults[0].citationLabel).toMatch(/MEMORY\.md/);

    const testResults = engine.search("Vitest unit tests");
    expect(testResults.length).toBeGreaterThanOrEqual(1);
  });

  it("dry-run reports entries without importing", async () => {
    const report = await engine.migrateFromOpenClaw(openclawDir, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.imported).toBe(3);

    // Nothing actually written — search finds nothing
    const results = engine.search("TypeScript strict mode");
    expect(results).toHaveLength(0);
  });

  it("migration-tagged entries survive the dream cycle (Tier 3 protection)", async () => {
    await engine.migrateFromOpenClaw(openclawDir);

    await engine.captureEpisode({
      sessionId: "sess-1",
      project: "test",
      interactionText: "TypeScript strict mode caught a type error",
      summary: "TS strict helped",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    const report = await engine.executeDream();
    expect(report.archived).toBe(0); // migration entries protected

    // Migrated entries still searchable
    const results = engine.search("TypeScript strict mode");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("ingests an arbitrary markdown file via ingestFile", async () => {
    const docPath = path.join(tmpDir, "api-conventions.md");
    fs.writeFileSync(
      docPath,
      "## REST Conventions\n\nUse nouns for resource names. Plural always.\n"
    );

    const result = await engine.ingestFile(docPath, {
      type: "semantic",
      domain: "api",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].domain).toBe("api");

    const searchResults = engine.search("REST resource names");
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
  });

  it("citation fields are populated on migrated search results", async () => {
    await engine.migrateFromOpenClaw(openclawDir);

    const results = engine.search("TypeScript strict mode");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const result = results[0];
    expect(result.sourceFile).toBe("MEMORY.md");
    expect(result.domain).toBe("typescript-preferences");
    expect(result.createdAt).toBeDefined();
    expect(result.citationLabel).toContain("MEMORY.md");
  });
});
