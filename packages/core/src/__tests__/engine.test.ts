import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("NeuroclawEngine", () => {
  let tmpDir: string;
  let configDir: string;
  let storeDir: string;
  let engine: NeuroclawEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-engine-"));
    configDir = path.join(tmpDir, "config");
    storeDir = path.join(tmpDir, "store");
    fs.mkdirSync(configDir, { recursive: true });

    // Write minimal base.yaml — agent.id is required, store_path points to tmpDir/store
    const baseYaml = [
      "agent:",
      "  id: test-agent",
      `  store_path: ${storeDir}`,
    ].join("\n");
    fs.writeFileSync(path.join(configDir, "base.yaml"), baseYaml);

    engine = new NeuroclawEngine(configDir);
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("initializes vault, database, and governance", async () => {
    await engine.init();
    expect(fs.existsSync(path.join(storeDir, "working.md"))).toBe(true);
    expect(fs.existsSync(path.join(storeDir, "index.db"))).toBe(true);
  });

  it("loads working memory", async () => {
    await engine.init();
    const wm = engine.getWorkingMemory();
    expect(wm).toContain("Working Memory");
  });

  it("searches memory (returns empty for fresh instance)", async () => {
    await engine.init();
    const results = engine.search("test query");
    expect(results).toEqual([]);
  });

  it("exposes config", async () => {
    await engine.init();
    const config = engine.getConfig();
    expect(config.agent).toBeDefined();
    expect(config.governance).toBeDefined();
  });

  it("exposes governance mode", async () => {
    await engine.init();
    expect(engine.getGovernanceMode()).toBeDefined();
  });

  it("captures an episode via captureEpisode facade", async () => {
    await engine.init();
    const record = await engine.captureEpisode({
      sessionId: "sess-1",
      project: "test",
      interactionText: "Great work!",
      summary: "User praised the implementation",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    expect(record.id).toMatch(/^ep-/);
    expect(record.valence).toBeGreaterThan(0);
  });

  it("executes a dream cycle", async () => {
    await engine.init();
    await engine.captureEpisode({
      sessionId: "sess-dream",
      project: null,
      interactionText: "This is a test interaction",
      summary: "Test episode for dream cycle",
      isCorrection: false,
      outcomeSignal: 0.0,
    });
    const report = await engine.executeDream();
    expect(report.episodesProcessed).toBe(1);
    expect(report.consolidated).toBe(1);
  });
});
