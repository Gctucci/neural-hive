import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";

describe("NeuroclawDB", () => {
  let tmpDir: string;
  let db: NeuroclawDB;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-db-"));
    db = await NeuroclawDB.create(path.join(tmpDir, "index.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates all tables on initialization", () => {
    const tables = db.listTables();
    expect(tables).toContain("episodes");
    expect(tables).toContain("semantic");
    expect(tables).toContain("procedures");
    expect(tables).toContain("relations");
    expect(tables).toContain("hypotheses");
    expect(tables).toContain("chunks_fts");
  });

  it("reports memory journal mode (sql.js runs in-memory)", () => {
    const mode = db.getJournalMode();
    expect(mode).toBe("memory");
  });

  describe("episodes", () => {
    it("inserts and retrieves an episode", () => {
      db.insertEpisode({
        id: "ep-001",
        timestamp: Date.now(),
        session_id: "session-abc",
        project: "neuroclaw",
        importance: 0.8,
        is_correction: false,
        outcome_signal: 0.5,
        consolidation_status: "pending",
        file_path: "episodic/2026-04-01/session-abc.md",
        summary: "Implemented config loader",
      });

      const episodes = db.getPendingEpisodes();
      expect(episodes).toHaveLength(1);
      expect(episodes[0].id).toBe("ep-001");
      expect(episodes[0].consolidation_status).toBe("pending");
    });
  });

  describe("semantic", () => {
    it("inserts and retrieves a semantic entry", () => {
      db.insertSemantic({
        id: "sem-001",
        domain: "typescript",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.7,
        ref_count: 1,
        confidence: 0.8,
        file_path: "semantic/domains/typescript.md",
        line_range: null,
      });

      const entry = db.getSemantic("sem-001");
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe("typescript");
    });
  });

  describe("FTS5 search", () => {
    it("indexes and searches content", () => {
      db.indexContent("sem-001", "semantic", "TypeScript barrel exports are the convention");
      db.indexContent("sem-002", "semantic", "Python uses __init__.py for package imports");

      const results = db.searchFTS("barrel exports");
      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe("sem-001");
    });

    it("ranks by BM25 relevance", () => {
      db.indexContent("a", "semantic", "TypeScript types are useful for safety");
      db.indexContent("b", "semantic", "TypeScript TypeScript TypeScript types everywhere");

      const results = db.searchFTS("TypeScript types");
      expect(results.length).toBeGreaterThanOrEqual(2);
      // b should rank higher (more term frequency)
      expect(results[0].source_id).toBe("b");
    });
  });

  describe("relations", () => {
    it("inserts and queries relations", () => {
      db.insertRelation({
        source_id: "sem-001",
        target_id: "sem-002",
        relation_type: "supports",
        weight: 0.8,
        created: Date.now(),
        last_used: Date.now(),
      });

      const relations = db.getRelationsFrom("sem-001");
      expect(relations).toHaveLength(1);
      expect(relations[0].target_id).toBe("sem-002");
      expect(relations[0].relation_type).toBe("supports");
    });
  });

  describe("hypotheses", () => {
    it("inserts and updates hypothesis status", () => {
      db.insertHypothesis({
        id: "hyp-001",
        claim: "User prefers named exports",
        evidence_for: 2,
        evidence_against: 0,
        status: "tentative",
        created: Date.now(),
        last_tested: Date.now(),
        outcome_score: 0.0,
      });

      db.updateHypothesisStatus("hyp-001", "confirmed");
      const hyp = db.getHypothesis("hyp-001");
      expect(hyp!.status).toBe("confirmed");
    });
  });

  describe("persistence", () => {
    it("saves and reloads from disk", async () => {
      const dbPath = path.join(tmpDir, "persist.db");
      const db1 = await NeuroclawDB.create(dbPath);
      db1.indexContent("x", "semantic", "persistence test content");
      db1.close(); // saves to disk

      const db2 = await NeuroclawDB.create(dbPath);
      const results = db2.searchFTS("persistence test");
      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe("x");
      db2.close();
    });
  });
});
