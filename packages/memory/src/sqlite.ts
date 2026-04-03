import Database from "better-sqlite3";
import type { Database as BetterSqliteDB } from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
  ConsolidationStatus,
} from "@neuroclaw/config";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    project TEXT,
    importance REAL NOT NULL DEFAULT 0.5,
    is_correction INTEGER NOT NULL DEFAULT 0,
    outcome_signal REAL NOT NULL DEFAULT 0.0,
    consolidation_status TEXT NOT NULL DEFAULT 'pending',
    file_path TEXT NOT NULL,
    summary TEXT NOT NULL,
    valence REAL NOT NULL DEFAULT 0.0,
    arousal REAL NOT NULL DEFAULT 0.0,
    context_snippet TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS semantic (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    created INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    ref_count INTEGER NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0.5,
    file_path TEXT NOT NULL,
    line_range TEXT,
    half_life REAL NOT NULL DEFAULT 30.0,
    retention REAL NOT NULL DEFAULT 1.0,
    source_episode_ids TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS procedures (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    task_type TEXT NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL,
    file_path TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS relations (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    created INTEGER NOT NULL,
    last_used INTEGER NOT NULL,
    provenance TEXT NOT NULL DEFAULT 'rule',
    confidence REAL NOT NULL DEFAULT 1.0,
    PRIMARY KEY (source_id, target_id, relation_type)
  );

  CREATE TABLE IF NOT EXISTS hypotheses (
    id TEXT PRIMARY KEY,
    claim TEXT NOT NULL,
    evidence_for INTEGER NOT NULL DEFAULT 0,
    evidence_against INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'tentative',
    created INTEGER NOT NULL,
    last_tested INTEGER NOT NULL,
    outcome_score REAL NOT NULL DEFAULT 0.0
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts4(
    content,
    source_id,
    source_type,
    notindexed=source_id,
    notindexed=source_type
  );
`;

export class NeuroclawDB {
  private db: BetterSqliteDB;

  private constructor(db: BetterSqliteDB) {
    this.db = db;
  }

  static create(dbPath: string): NeuroclawDB {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(SCHEMA);
    // Migrate existing DBs: add tags column if missing
    const semanticCols = db.pragma("table_info(semantic)") as Array<{ name: string }>;
    if (!semanticCols.some((c) => c.name === "tags")) {
      db.exec("ALTER TABLE semantic ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
    }
    return new NeuroclawDB(db);
  }

  close(): void {
    this.db.close();
  }

  /** No-op: better-sqlite3 writes to disk automatically. Kept for API compatibility. */
  save(): void {}

  listTables(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  getJournalMode(): string {
    const row = this.db.pragma("journal_mode") as Array<{ journal_mode: string }>;
    return row[0]?.journal_mode ?? "unknown";
  }

  // --- Episodes ---

  insertEpisode(ep: EpisodeRecord): void {
    this.db
      .prepare(
        `INSERT INTO episodes (id, timestamp, session_id, project, importance, is_correction, outcome_signal, consolidation_status, file_path, summary, valence, arousal, context_snippet)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ep.id, ep.timestamp, ep.session_id, ep.project, ep.importance,
        ep.is_correction ? 1 : 0, ep.outcome_signal, ep.consolidation_status,
        ep.file_path, ep.summary, ep.valence, ep.arousal, ep.context_snippet
      );
  }

  getPendingEpisodes(): EpisodeRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM episodes WHERE consolidation_status = 'pending' ORDER BY importance DESC")
      .all() as EpisodeRecord[];
    return rows.map((r) => ({ ...r, is_correction: Boolean(r.is_correction) }));
  }

  getAllEpisodes(): EpisodeRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM episodes ORDER BY timestamp DESC")
      .all() as EpisodeRecord[];
    return rows.map((r) => ({ ...r, is_correction: Boolean(r.is_correction) }));
  }

  updateEpisodeStatus(id: string, status: ConsolidationStatus): void {
    this.db.prepare("UPDATE episodes SET consolidation_status = ? WHERE id = ?").run(status, id);
  }

  // --- Semantic ---

  insertSemantic(entry: SemanticRecord): void {
    this.db
      .prepare(
        `INSERT INTO semantic (id, domain, created, last_accessed, importance, ref_count, confidence, file_path, line_range, half_life, retention, source_episode_ids, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id, entry.domain, entry.created, entry.last_accessed, entry.importance,
        entry.ref_count, entry.confidence, entry.file_path, entry.line_range,
        entry.half_life, entry.retention, entry.source_episode_ids, entry.tags
      );
  }

  getSemantic(id: string): SemanticRecord | null {
    return (this.db.prepare("SELECT * FROM semantic WHERE id = ?").get(id) as SemanticRecord) ?? null;
  }

  getSemanticByDomain(domain: string): SemanticRecord[] {
    return this.db.prepare("SELECT * FROM semantic WHERE domain = ?").all(domain) as SemanticRecord[];
  }

  getAllSemanticEntries(): SemanticRecord[] {
    return this.db.prepare("SELECT * FROM semantic ORDER BY importance DESC").all() as SemanticRecord[];
  }

  updateSemanticRetention(id: string, retention: number, halfLife: number): void {
    this.db
      .prepare("UPDATE semantic SET retention = ?, half_life = ? WHERE id = ?")
      .run(retention, halfLife, id);
  }

  incrementSemanticRefCount(id: string): void {
    this.db
      .prepare("UPDATE semantic SET ref_count = ref_count + 1, last_accessed = ? WHERE id = ?")
      .run(Date.now(), id);
  }

  // --- Procedures ---

  insertProcedure(proc: ProcedureRecord): void {
    this.db
      .prepare(
        `INSERT INTO procedures (id, name, task_type, success_count, last_used, file_path)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(proc.id, proc.name, proc.task_type, proc.success_count, proc.last_used, proc.file_path);
  }

  // --- Relations ---

  insertRelation(rel: RelationRecord): void {
    this.db
      .prepare(
        `INSERT INTO relations (source_id, target_id, relation_type, weight, created, last_used, provenance, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        rel.source_id, rel.target_id, rel.relation_type, rel.weight,
        rel.created, rel.last_used, rel.provenance, rel.confidence
      );
  }

  getRelationsFrom(sourceId: string): RelationRecord[] {
    return this.db.prepare("SELECT * FROM relations WHERE source_id = ?").all(sourceId) as RelationRecord[];
  }

  getRelationsTo(targetId: string): RelationRecord[] {
    return this.db.prepare("SELECT * FROM relations WHERE target_id = ?").all(targetId) as RelationRecord[];
  }

  incrementEdgeWeight(sourceId: string, targetId: string, relationType: string): void {
    this.db
      .prepare(
        `UPDATE relations
         SET weight = min(weight + 0.05, 2.0), last_used = ?
         WHERE source_id = ? AND target_id = ? AND relation_type = ?`
      )
      .run(Date.now(), sourceId, targetId, relationType);
  }

  getStaleEdges(windowDays: number): RelationRecord[] {
    const cutoff = Date.now() - windowDays * 86_400_000;
    return this.db
      .prepare("SELECT * FROM relations WHERE last_used < ?")
      .all(cutoff) as RelationRecord[];
  }

  updateEdgeWeight(
    sourceId: string,
    targetId: string,
    relationType: string,
    weight: number
  ): void {
    this.db
      .prepare(
        `UPDATE relations SET weight = ?
         WHERE source_id = ? AND target_id = ? AND relation_type = ?`
      )
      .run(weight, sourceId, targetId, relationType);
  }

  // --- Hypotheses ---

  insertHypothesis(hyp: HypothesisRecord): void {
    this.db
      .prepare(
        `INSERT INTO hypotheses (id, claim, evidence_for, evidence_against, status, created, last_tested, outcome_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        hyp.id, hyp.claim, hyp.evidence_for, hyp.evidence_against,
        hyp.status, hyp.created, hyp.last_tested, hyp.outcome_score
      );
  }

  getHypothesis(id: string): HypothesisRecord | null {
    return (this.db.prepare("SELECT * FROM hypotheses WHERE id = ?").get(id) as HypothesisRecord) ?? null;
  }

  getAllHypotheses(): HypothesisRecord[] {
    return this.db.prepare("SELECT * FROM hypotheses ORDER BY created DESC").all() as HypothesisRecord[];
  }

  updateHypothesisStatus(id: string, status: HypothesisStatus): void {
    this.db.prepare("UPDATE hypotheses SET status = ? WHERE id = ?").run(status, id);
  }

  // --- FTS ---

  indexContent(sourceId: string, sourceType: string, content: string): void {
    this.db
      .prepare("INSERT INTO chunks_fts (content, source_id, source_type) VALUES (?, ?, ?)")
      .run(content, sourceId, sourceType);
  }

  searchFTS(
    query: string,
    limit: number = 20
  ): Array<{ source_id: string; source_type: string; rank: number }> {
    return this.db
      .prepare(
        `SELECT source_id, source_type,
                -(length(offsets(chunks_fts)) - length(replace(offsets(chunks_fts), ' ', '')) + 1) / 4 as rank
         FROM chunks_fts
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit) as Array<{ source_id: string; source_type: string; rank: number }>;
  }
}
