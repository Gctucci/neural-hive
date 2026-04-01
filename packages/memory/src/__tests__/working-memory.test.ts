import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Vault } from "../vault";
import { WorkingMemory } from "../working-memory";

describe("WorkingMemory", () => {
  let tmpDir: string;
  let vault: Vault;
  let wm: WorkingMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-wm-"));
    vault = new Vault(tmpDir);
    vault.init();
    wm = new WorkingMemory(vault, 10);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads working memory content", () => {
    const content = wm.load();
    expect(content).toContain("Working Memory");
  });

  it("adds an entry", () => {
    wm.addEntry("User prefers TypeScript over JavaScript");
    const content = wm.load();
    expect(content).toContain("User prefers TypeScript over JavaScript");
  });

  it("prunes when exceeding max lines", () => {
    for (let i = 0; i < 12; i++) {
      wm.addEntry(`Entry number ${i}`);
    }
    const content = wm.load();
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it("preserves most recent entries when pruning", () => {
    for (let i = 0; i < 12; i++) {
      wm.addEntry(`Entry ${i}`);
    }
    const content = wm.load();
    expect(content).toContain("Entry 11");
    expect(content).not.toContain("Entry 0");
  });

  it("replaces an existing entry by key", () => {
    wm.addEntry("Project: old-project", "project");
    wm.addEntry("Project: new-project", "project");
    const content = wm.load();
    expect(content).toContain("new-project");
    expect(content).not.toContain("old-project");
  });
});
