import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Vault } from "../vault";

describe("Vault", () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-vault-"));
    vault = new Vault(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe("initialization", () => {
    it("creates vault directory structure on init", () => {
      vault.init();
      expect(fs.existsSync(path.join(tmpDir, "working.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "episodic"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "semantic", "domains"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "semantic", "projects"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "procedural"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "self-model"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "dreams"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "archive"))).toBe(true);
    });

    it("creates default self-model files on init", () => {
      vault.init();
      expect(fs.existsSync(path.join(tmpDir, "self-model", "identity.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "self-model", "capabilities.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "self-model", "hypotheses.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "self-model", "evolution-log.md"))).toBe(true);
    });
  });

  describe("read/write", () => {
    it("writes and reads a file", () => {
      vault.init();
      vault.write("semantic/domains/typescript.md", "# TypeScript\n\nTS is great.");
      const content = vault.read("semantic/domains/typescript.md");
      expect(content).toBe("# TypeScript\n\nTS is great.");
    });

    it("returns null for non-existent file", () => {
      vault.init();
      const content = vault.read("semantic/domains/nonexistent.md");
      expect(content).toBeNull();
    });

    it("creates parent directories on write", () => {
      vault.init();
      vault.write("episodic/2026-04-01/session-abc.md", "# Episode");
      const content = vault.read("episodic/2026-04-01/session-abc.md");
      expect(content).toBe("# Episode");
    });

    it("appends to a file", () => {
      vault.init();
      vault.write("self-model/evolution-log.md", "Entry 1\n");
      vault.append("self-model/evolution-log.md", "Entry 2\n");
      const content = vault.read("self-model/evolution-log.md");
      expect(content).toBe("Entry 1\nEntry 2\n");
    });
  });

  describe("list", () => {
    it("lists files in a directory", () => {
      vault.init();
      vault.write("semantic/domains/ts.md", "content");
      vault.write("semantic/domains/python.md", "content");
      const files = vault.list("semantic/domains");
      expect(files).toContain("ts.md");
      expect(files).toContain("python.md");
    });

    it("returns empty array for non-existent directory", () => {
      vault.init();
      const files = vault.list("nonexistent");
      expect(files).toEqual([]);
    });
  });

  describe("exists", () => {
    it("returns true for existing file", () => {
      vault.init();
      expect(vault.exists("working.md")).toBe(true);
    });

    it("returns false for non-existing file", () => {
      vault.init();
      expect(vault.exists("nope.md")).toBe(false);
    });
  });

  describe("move", () => {
    it("moves a file to archive", () => {
      vault.init();
      vault.write("semantic/domains/old.md", "old content");
      vault.move("semantic/domains/old.md", "archive/old.md");
      expect(vault.exists("semantic/domains/old.md")).toBe(false);
      expect(vault.read("archive/old.md")).toBe("old content");
    });
  });
});
