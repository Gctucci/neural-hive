import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";

describe("NeuroclawDB", () => {
  let tmpDir: string;
  let db: NeuroclawDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-db-"));
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
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

  it("reports WAL journal mode", () => {
    const mode = db.getJournalMode();
    expect(mode).toBe("wal");
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
        valence: 0,
        arousal: 0,
        context_snippet: "",
      });

      const episodes = db.getPendingEpisodes();
      expect(episodes).toHaveLength(1);
      expect(episodes[0].id).toBe("ep-001");
      expect(episodes[0].consolidation_status).toBe("pending");
    });

    it("stores and retrieves valence, arousal, and context_snippet", () => {
      db.insertEpisode({
        id: "ep-002",
        timestamp: Date.now(),
        session_id: "session-xyz",
        project: "neuroclaw",
        importance: 0.9,
        is_correction: false,
        outcome_signal: 0.7,
        consolidation_status: "pending",
        file_path: "episodic/2026-04-01/session-xyz.md",
        summary: "Fixed a critical bug",
        valence: 0.8,
        arousal: 0.6,
        context_snippet: "The bug caused data corruption in production",
      });

      const episodes = db.getPendingEpisodes();
      expect(episodes).toHaveLength(1);
      expect(episodes[0].valence).toBe(0.8);
      expect(episodes[0].arousal).toBe(0.6);
      expect(episodes[0].context_snippet).toBe("The bug caused data corruption in production");
    });

    it("supports negative valence for negative experiences", () => {
      db.insertEpisode({
        id: "ep-003",
        timestamp: Date.now(),
        session_id: "session-neg",
        project: "neuroclaw",
        importance: 0.7,
        is_correction: true,
        outcome_signal: -0.3,
        consolidation_status: "pending",
        file_path: "episodic/2026-04-01/session-neg.md",
        summary: "Made an error that required correction",
        valence: -0.5,
        arousal: 0.4,
        context_snippet: "Wrong approach caused test failures",
      });

      const episodes = db.getPendingEpisodes();
      expect(episodes[0].valence).toBe(-0.5);
    });

    it("updateEpisodeStatus changes consolidation_status", () => {
      db.insertEpisode({
        id: "ep-004",
        timestamp: Date.now(),
        session_id: "session-abc",
        project: "neuroclaw",
        importance: 0.8,
        is_correction: false,
        outcome_signal: 0.5,
        consolidation_status: "pending",
        file_path: "episodic/2026-04-01/session-abc.md",
        summary: "Test episode",
        valence: 0,
        arousal: 0,
        context_snippet: "",
      });

      db.updateEpisodeStatus("ep-004", "consolidated");

      // Should no longer appear in pending episodes
      const pending = db.getPendingEpisodes();
      expect(pending).toHaveLength(0);
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
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });

      const entry = db.getSemantic("sem-001");
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe("typescript");
    });

    it("stores and retrieves half_life, retention, and source_episode_ids", () => {
      db.insertSemantic({
        id: "sem-002",
        domain: "patterns",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.6,
        ref_count: 2,
        confidence: 0.9,
        file_path: "semantic/domains/patterns.md",
        line_range: "10-20",
        half_life: 60,
        retention: 0.85,
        source_episode_ids: "ep-001,ep-002",
        tags: "",
      });

      const entry = db.getSemantic("sem-002");
      expect(entry).not.toBeNull();
      expect(entry!.half_life).toBe(60);
      expect(entry!.retention).toBe(0.85);
      expect(entry!.source_episode_ids).toBe("ep-001,ep-002");
    });

    it("getSemanticByDomain filters by domain", () => {
      db.insertSemantic({
        id: "sem-003",
        domain: "python",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.5,
        ref_count: 0,
        confidence: 0.7,
        file_path: "semantic/domains/python.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });
      db.insertSemantic({
        id: "sem-004",
        domain: "typescript",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.8,
        ref_count: 3,
        confidence: 0.9,
        file_path: "semantic/domains/ts2.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });

      const tsEntries = db.getSemanticByDomain("typescript");
      expect(tsEntries).toHaveLength(1);
      expect(tsEntries[0].id).toBe("sem-004");

      const pythonEntries = db.getSemanticByDomain("python");
      expect(pythonEntries).toHaveLength(1);
      expect(pythonEntries[0].id).toBe("sem-003");
    });

    it("getAllSemanticEntries returns all entries ordered by importance", () => {
      db.insertSemantic({
        id: "sem-low",
        domain: "misc",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.2,
        ref_count: 0,
        confidence: 0.5,
        file_path: "semantic/misc.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });
      db.insertSemantic({
        id: "sem-high",
        domain: "core",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.9,
        ref_count: 5,
        confidence: 0.95,
        file_path: "semantic/core.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });

      const all = db.getAllSemanticEntries();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe("sem-high");
      expect(all[1].id).toBe("sem-low");
    });

    it("updateSemanticRetention updates retention and half_life", () => {
      db.insertSemantic({
        id: "sem-decay",
        domain: "old-topic",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.5,
        ref_count: 1,
        confidence: 0.7,
        file_path: "semantic/old-topic.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });

      db.updateSemanticRetention("sem-decay", 0.6, 45);

      const entry = db.getSemantic("sem-decay");
      expect(entry!.retention).toBe(0.6);
      expect(entry!.half_life).toBe(45);
    });

    it("incrementSemanticRefCount increases ref_count and updates last_accessed", () => {
      const before = Date.now();
      db.insertSemantic({
        id: "sem-ref",
        domain: "typescript",
        created: before,
        last_accessed: before,
        importance: 0.7,
        ref_count: 2,
        confidence: 0.8,
        file_path: "semantic/ts-ref.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "",
      });

      db.incrementSemanticRefCount("sem-ref");

      const entry = db.getSemantic("sem-ref");
      expect(entry!.ref_count).toBe(3);
      expect(entry!.last_accessed).toBeGreaterThanOrEqual(before);
    });

    it("stores and retrieves tags field", () => {
      db.insertSemantic({
        id: "sem-tags",
        domain: "coding-preferences",
        created: Date.now(),
        last_accessed: Date.now(),
        importance: 0.7,
        ref_count: 0,
        confidence: 0.8,
        file_path: "semantic/domains/coding-preferences/sem-tags.md",
        line_range: null,
        half_life: 30,
        retention: 1.0,
        source_episode_ids: "",
        tags: "migration,source:MEMORY.md",
      });

      const entry = db.getSemantic("sem-tags");
      expect(entry).not.toBeNull();
      expect(entry!.tags).toBe("migration,source:MEMORY.md");
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
        provenance: "rule",
        confidence: 1.0,
      });

      const relations = db.getRelationsFrom("sem-001");
      expect(relations).toHaveLength(1);
      expect(relations[0].target_id).toBe("sem-002");
      expect(relations[0].relation_type).toBe("supports");
    });

    it("stores and retrieves provenance and confidence", () => {
      db.insertRelation({
        source_id: "sem-010",
        target_id: "sem-011",
        relation_type: "elaborates",
        weight: 0.6,
        created: Date.now(),
        last_used: Date.now(),
        provenance: "llm",
        confidence: 0.75,
      });

      const relations = db.getRelationsFrom("sem-010");
      expect(relations).toHaveLength(1);
      expect(relations[0].provenance).toBe("llm");
      expect(relations[0].confidence).toBe(0.75);
    });

    it("getRelationsTo returns incoming relations for a target", () => {
      db.insertRelation({
        source_id: "sem-a",
        target_id: "sem-c",
        relation_type: "supports",
        weight: 0.9,
        created: Date.now(),
        last_used: Date.now(),
        provenance: "rule",
        confidence: 1.0,
      });
      db.insertRelation({
        source_id: "sem-b",
        target_id: "sem-c",
        relation_type: "elaborates",
        weight: 0.7,
        created: Date.now(),
        last_used: Date.now(),
        provenance: "llm",
        confidence: 0.8,
      });
      db.insertRelation({
        source_id: "sem-a",
        target_id: "sem-d",
        relation_type: "requires",
        weight: 1.0,
        created: Date.now(),
        last_used: Date.now(),
        provenance: "rule",
        confidence: 1.0,
      });

      const toC = db.getRelationsTo("sem-c");
      expect(toC).toHaveLength(2);
      const sourceIds = toC.map((r) => r.source_id).sort();
      expect(sourceIds).toEqual(["sem-a", "sem-b"]);

      const toD = db.getRelationsTo("sem-d");
      expect(toD).toHaveLength(1);
      expect(toD[0].source_id).toBe("sem-a");
    });
  });

  describe("GSEM edge methods", () => {
    beforeEach(() => {
      db.insertRelation({
        source_id: "sem-a",
        target_id: "sem-b",
        relation_type: "supports",
        weight: 1.0,
        created: Date.now(),
        last_used: Date.now() - 40 * 24 * 60 * 60 * 1000, // 40 days ago
        provenance: "rule",
        confidence: 1.0,
      });
    });

    it("incrementEdgeWeight increases weight by 0.05", () => {
      db.incrementEdgeWeight("sem-a", "sem-b", "supports");
      const rels = db.getRelationsFrom("sem-a");
      expect(rels[0].weight).toBeCloseTo(1.05, 5);
    });

    it("incrementEdgeWeight caps weight at 2.0", () => {
      for (let i = 0; i < 25; i++) {
        db.incrementEdgeWeight("sem-a", "sem-b", "supports");
      }
      const rels = db.getRelationsFrom("sem-a");
      expect(rels[0].weight).toBe(2.0);
    });

    it("getStaleEdges returns edges not used within window", () => {
      const stale = db.getStaleEdges(30); // 30-day window; edge is 40 days old
      expect(stale).toHaveLength(1);
      expect(stale[0].source_id).toBe("sem-a");
    });

    it("getStaleEdges excludes recent edges", () => {
      db.insertRelation({
        source_id: "sem-c",
        target_id: "sem-d",
        relation_type: "elaborates",
        weight: 1.0,
        created: Date.now(),
        last_used: Date.now(), // just now
        provenance: "rule",
        confidence: 1.0,
      });
      const stale = db.getStaleEdges(30);
      const ids = stale.map((r) => r.source_id);
      expect(ids).toContain("sem-a");
      expect(ids).not.toContain("sem-c");
    });

    it("updateEdgeWeight sets the exact weight", () => {
      db.updateEdgeWeight("sem-a", "sem-b", "supports", 0.5);
      const rels = db.getRelationsFrom("sem-a");
      expect(rels[0].weight).toBe(0.5);
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
    it("saves and reloads from disk", () => {
      const dbPath = path.join(tmpDir, "persist.db");
      const db1 = NeuroclawDB.create(dbPath);
      db1.indexContent("x", "semantic", "persistence test content");
      db1.close();

      const db2 = NeuroclawDB.create(dbPath);
      const results = db2.searchFTS("persistence test");
      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe("x");
      db2.close();
    });
  });
});
