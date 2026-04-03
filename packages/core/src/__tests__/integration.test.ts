import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("NeuroClaw Integration — full init + search flow", () => {
  let tmpDir: string;
  let configDir: string;
  let engine: NeuroclawEngine | undefined;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-integration-"));
    configDir = path.join(tmpDir, "config");
    fs.mkdirSync(configDir, { recursive: true });

    // Use forward slashes for the store_path in YAML (js-yaml handles it cross-platform)
    const storePathYaml = path.join(tmpDir, "store").replace(/\\/g, "/");

    const configContent = `
agent:
  id: integration-test
  store_path: "${storePathYaml}"
governance:
  mode: supervised
`;
    fs.writeFileSync(path.join(configDir, "base.yaml"), configContent);

    engine = new NeuroclawEngine(configDir);
    await engine.init();
  });

  afterEach(() => {
    engine?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("initializes vault and database", () => {
    const storeDir = path.join(tmpDir, "store");
    expect(fs.existsSync(path.join(storeDir, "working.md"))).toBe(true);
    expect(fs.existsSync(path.join(storeDir, "index.db"))).toBe(true);
  });

  it("loads config with correct agent id", () => {
    const config = engine.getConfig();
    expect(config.agent.id).toBe("integration-test");
    expect(engine.getGovernanceMode()).toBeDefined();
  });

  it("search returns empty for fresh instance", () => {
    const results = engine.search("anything");
    expect(results).toEqual([]);
  });

  it("working memory is loaded", () => {
    const wm = engine.getWorkingMemory();
    expect(wm).toContain("Working Memory");
  });
});

describe("Phase 2 Integration", () => {
  let tmpDir: string;
  let configDir: string;
  let storeDir: string;
  let engine: NeuroclawEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-p2-"));
    configDir = path.join(tmpDir, "config");
    storeDir = path.join(tmpDir, "store");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: test-agent\n  store_path: ${storeDir}\n`
    );
    engine = new NeuroclawEngine(configDir);
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("full cycle: capture episodes -> dream -> search retrieves consolidated knowledge", async () => {
    await engine.init();

    // Capture episodes
    await engine.captureEpisode({
      sessionId: "sess-int",
      project: "my-app",
      interactionText: "Working on src/auth/middleware.ts — session check was in wrong order",
      summary: "Auth middleware must validate sessions before processing requests",
      isCorrection: true,
      outcomeSignal: -0.3,
    });

    await engine.captureEpisode({
      sessionId: "sess-int",
      project: "my-app",
      interactionText: "Perfect, the auth flow is correct now",
      summary: "Auth middleware session validation order confirmed working",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    // Run dream cycle
    const report = await engine.executeDream();
    expect(report.episodesProcessed).toBe(2);
    expect(report.consolidated).toBe(2);
    expect(report.healthScore).toBeGreaterThan(0);

    // Search should find consolidated knowledge
    const results = engine.search("auth middleware session");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
