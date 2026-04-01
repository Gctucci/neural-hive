import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, mergeConfigs, resolveStorePath } from "../loader";

describe("mergeConfigs", () => {
  it("later layers override earlier layers", () => {
    const base = { agent: { id: "base", role: "general" } };
    const user = { agent: { id: "custom" } };
    const merged = mergeConfigs(base, user);
    expect(merged.agent.id).toBe("custom");
    expect(merged.agent.role).toBe("general");
  });

  it("deeply merges nested objects", () => {
    const base = {
      memory: { forgetting: { enabled: true, decay_window_days: 30 } },
    };
    const user = { memory: { forgetting: { decay_window_days: 60 } } };
    const merged = mergeConfigs(base, user);
    expect(merged.memory.forgetting.enabled).toBe(true);
    expect(merged.memory.forgetting.decay_window_days).toBe(60);
  });

  it("does not merge arrays — later replaces earlier", () => {
    const base = {
      memory: {
        forgetting: { unforgettable_categories: ["corrections", "procedural"] },
      },
    };
    const user = {
      memory: {
        forgetting: { unforgettable_categories: ["corrections"] },
      },
    };
    const merged = mergeConfigs(base, user);
    expect(merged.memory.forgetting.unforgettable_categories).toEqual([
      "corrections",
    ]);
  });
});

describe("resolveStorePath", () => {
  it("expands ~ to home directory", () => {
    const resolved = resolveStorePath("~/neuroclaw/agents/test/");
    expect(resolved).toBe(
      path.join(os.homedir(), "neuroclaw", "agents", "test")
    );
  });

  it("expands ${agent.id} placeholder", () => {
    const resolved = resolveStorePath(
      "~/neuroclaw/agents/${agent.id}/",
      "my-agent"
    );
    expect(resolved).toBe(
      path.join(os.homedir(), "neuroclaw", "agents", "my-agent")
    );
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads base.yaml and applies schema defaults", () => {
    const baseYaml = 'agent:\n  id: "test-agent"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("test-agent");
    expect(config.governance.mode).toBe("supervised");
  });

  it("merges user.yaml over base.yaml", () => {
    const baseYaml = 'agent:\n  id: "base"\n';
    const userYaml = 'agent:\n  id: "user-override"\ngovernance:\n  mode: "autonomous"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);
    fs.writeFileSync(path.join(tmpDir, "user.yaml"), userYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("user-override");
    expect(config.governance.mode).toBe("autonomous");
  });

  it("merges agent-specific yaml over user.yaml", () => {
    const baseYaml = 'agent:\n  id: "base"\n';
    const userYaml = 'governance:\n  mode: "supervised"\n';
    const agentYaml = 'agent:\n  id: "research"\ngovernance:\n  mode: "autonomous"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);
    fs.writeFileSync(path.join(tmpDir, "user.yaml"), userYaml);
    fs.mkdirSync(path.join(tmpDir, "agents"));
    fs.writeFileSync(path.join(tmpDir, "agents", "research.yaml"), agentYaml);

    const config = loadConfig(tmpDir, "research");
    expect(config.agent.id).toBe("research");
    expect(config.governance.mode).toBe("autonomous");
  });

  it("works with base.yaml only (no user.yaml, no agent yaml)", () => {
    const baseYaml = 'agent:\n  id: "solo"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("solo");
  });

  it("throws on invalid config", () => {
    const badYaml = 'governance:\n  mode: "yolo"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), badYaml);

    expect(() => loadConfig(tmpDir)).toThrow();
  });
});
