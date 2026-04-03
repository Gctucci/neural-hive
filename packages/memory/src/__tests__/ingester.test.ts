import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { Ingester } from "../ingester";

describe("Ingester", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let ingester: Ingester;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingester-test-"));
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
    vault = new Vault(tmpDir);
    vault.init();
    ingester = new Ingester(db, vault);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("splits MEMORY.md by H2 headings into multiple semantic entries", async () => {
    const content = [
      "## Coding Preferences",
      "",
      "I prefer explicit error handling over broad try-catch.",
      "",
      "## Git Workflow",
      "",
      "Always rebase before merging to main.",
      "",
    ].join("\n");

    const result = await ingester.ingest({
      filePath: "MEMORY.md",
      content,
      tags: "migration,source:MEMORY.md",
    });

    expect(result.dryRun).toBe(false);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].domain).toBe("coding-preferences");
    expect(result.entries[1].domain).toBe("git-workflow");
  });

  it("derives domain from H2 heading text", async () => {
    const content = "## API Design & Conventions\n\nUse REST over GraphQL.\n";
    const result = await ingester.ingest({ filePath: "MEMORY.md", content });
    expect(result.entries[0].domain).toBe("api-design-conventions");
  });

  it("falls back to paragraph splitting when no H2 headings", async () => {
    const content = [
      "I prefer TypeScript over JavaScript.",
      "",
      "Always write tests first.",
      "",
      "Keep functions small.",
    ].join("\n");

    const result = await ingester.ingest({ filePath: "notes.md", content });
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
  });

  it("merges short paragraphs (< 50 chars) with the next", async () => {
    const content = [
      "Short line.",
      "",
      "This is a longer paragraph that has more than fifty characters total.",
    ].join("\n");

    const result = await ingester.ingest({ filePath: "notes.md", content });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toContain("Short line.");
    expect(result.entries[0].content).toContain("longer paragraph");
  });

  it("dry-run returns entries without writing to vault or DB", async () => {
    const content = "## Test Section\n\nSome content here.\n";
    const result = await ingester.ingest({
      filePath: "MEMORY.md",
      content,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.entries).toHaveLength(1);

    expect(fs.existsSync(path.join(tmpDir, "semantic/domains", "test-section"))).toBe(false);

    const dbEntries = db.getAllSemanticEntries();
    expect(dbEntries).toHaveLength(0);
  });

  it("writes vault file and inserts DB record on real ingest", async () => {
    const content = "## My Domain\n\nSome knowledge here.\n";
    const result = await ingester.ingest({
      filePath: "MEMORY.md",
      content,
      tags: "migration,source:MEMORY.md",
    });

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];

    const vaultContent = vault.read(entry.vaultPath);
    expect(vaultContent).not.toBeNull();
    expect(vaultContent).toContain("Some knowledge here.");
    expect(vaultContent).toContain("source: MEMORY.md");

    const dbRecord = db.getSemantic(entry.id);
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.domain).toBe("my-domain");
    expect(dbRecord!.tags).toBe("migration,source:MEMORY.md");
  });

  it("domain override takes precedence over derived domain", async () => {
    const content = "## Ignored Heading\n\nContent.\n";
    const result = await ingester.ingest({
      filePath: "notes.md",
      content,
      domain: "forced-domain",
    });
    expect(result.entries[0].domain).toBe("forced-domain");
  });

  it("migration-tagged entries get importance 0.6 base, others 0.5", async () => {
    const content = "## Topic\n\nSome content.\n";

    const migrated = await ingester.ingest({
      filePath: "MEMORY.md",
      content,
      tags: "migration,source:MEMORY.md",
    });
    const plain = await ingester.ingest({
      filePath: "notes.md",
      content,
    });

    expect(migrated.entries[0].importance).toBeGreaterThan(plain.entries[0].importance);
  });

  it("indexes content in FTS", async () => {
    const content = "## TypeScript Tips\n\nUse strict mode always.\n";
    await ingester.ingest({ filePath: "MEMORY.md", content, tags: "migration" });

    const results = db.searchFTS("strict mode");
    expect(results).toHaveLength(1);
  });

  it("ingest of episodic type writes to episodic vault path", async () => {
    const content = "Today I worked on the auth module and fixed a bug.";
    const result = await ingester.ingest({
      filePath: "memory/2026-01-15.md",
      content,
      type: "episodic",
      tags: "migration,source:daily",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].vaultPath).toMatch(/^episodic\//);
  });
});
