import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { Ingester } from "../ingester";
import { Migrator } from "../migrator";

describe("Migrator", () => {
  let tmpDir: string;
  let openclawDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let migrator: Migrator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrator-test-"));
    openclawDir = path.join(tmpDir, "openclaw-project");
    fs.mkdirSync(openclawDir, { recursive: true });

    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
    vault = new Vault(tmpDir);
    vault.init();
    migrator = new Migrator(new Ingester(db, vault));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe("scan()", () => {
    it("finds MEMORY.md when present", () => {
      fs.writeFileSync(
        path.join(openclawDir, "MEMORY.md"),
        "## Coding\n\nI like TypeScript.\n"
      );
      const manifest = migrator.scan(openclawDir);
      const memoryFile = manifest.files.find((f) => f.fileType === "memory");
      expect(memoryFile).toBeDefined();
      expect(memoryFile!.exists).toBe(true);
    });

    it("reports MEMORY.md as not existing when absent", () => {
      const manifest = migrator.scan(openclawDir);
      const memoryFile = manifest.files.find((f) => f.fileType === "memory");
      expect(memoryFile).toBeDefined();
      expect(memoryFile!.exists).toBe(false);
    });

    it("finds daily memory files in memory/ subdirectory", () => {
      const memDir = path.join(openclawDir, "memory");
      fs.mkdirSync(memDir);
      fs.writeFileSync(path.join(memDir, "2026-01-15.md"), "Worked on auth today.");
      fs.writeFileSync(path.join(memDir, "2026-01-16.md"), "Fixed bug in payment flow.");
      fs.writeFileSync(path.join(memDir, "not-a-date.md"), "Should not be included.");

      const manifest = migrator.scan(openclawDir);
      const dailyFiles = manifest.files.filter((f) => f.fileType === "daily");
      expect(dailyFiles).toHaveLength(2);
      const names = dailyFiles.map((f) => path.basename(f.path));
      expect(names).toContain("2026-01-15.md");
      expect(names).toContain("2026-01-16.md");
    });

    it("returns workDir in manifest", () => {
      const manifest = migrator.scan(openclawDir);
      expect(manifest.workDir).toBe(openclawDir);
    });
  });

  describe("run()", () => {
    it("imports MEMORY.md as semantic entries", async () => {
      fs.writeFileSync(
        path.join(openclawDir, "MEMORY.md"),
        [
          "## Coding Preferences",
          "",
          "I prefer explicit error handling.",
          "",
          "## Git Workflow",
          "",
          "Always rebase before merging.",
        ].join("\n")
      );

      const manifest = migrator.scan(openclawDir);
      const report = await migrator.run(manifest);

      expect(report.imported).toBe(2);
      expect(report.dryRun).toBe(false);

      const semanticEntries = db.getAllSemanticEntries();
      expect(semanticEntries).toHaveLength(2);
      expect(semanticEntries.every((e) => e.tags.includes("migration"))).toBe(true);
      expect(semanticEntries.every((e) => e.tags.includes("source:MEMORY.md"))).toBe(true);
    });

    it("imports daily memory files as episodic entries", async () => {
      const memDir = path.join(openclawDir, "memory");
      fs.mkdirSync(memDir);
      fs.writeFileSync(path.join(memDir, "2026-01-15.md"), "Worked on auth today.");
      fs.writeFileSync(path.join(memDir, "2026-01-16.md"), "Fixed the payment bug.");

      const manifest = migrator.scan(openclawDir);
      const report = await migrator.run(manifest);

      expect(report.imported).toBe(2);
      const allEpisodes = db.getAllEpisodes();
      expect(allEpisodes).toHaveLength(2);
      expect(allEpisodes.every((e) => e.consolidation_status === "migrated")).toBe(true);
    });

    it("skips non-existent files without error", async () => {
      const manifest = migrator.scan(openclawDir);
      const report = await migrator.run(manifest);
      expect(report.skipped).toBeGreaterThan(0);
      expect(report.imported).toBe(0);
    });

    it("dry-run does not write to vault or DB", async () => {
      fs.writeFileSync(
        path.join(openclawDir, "MEMORY.md"),
        "## Topic\n\nSome content.\n"
      );

      const manifest = migrator.scan(openclawDir);
      const report = await migrator.run(manifest, { dryRun: true });

      expect(report.dryRun).toBe(true);
      expect(report.entries).toHaveLength(1);
      expect(db.getAllSemanticEntries()).toHaveLength(0);
    });

    it("does not modify source files", async () => {
      const content = "## Topic\n\nSome content.\n";
      const filePath = path.join(openclawDir, "MEMORY.md");
      fs.writeFileSync(filePath, content);

      const manifest = migrator.scan(openclawDir);
      await migrator.run(manifest);

      expect(fs.readFileSync(filePath, "utf-8")).toBe(content);
    });
  });
});
