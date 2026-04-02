import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
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
    summary TEXT NOT NULL
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
    line_range TEXT
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

function queryAll(db: SqlJsDatabase, sql: string, params?: any[]): any[] {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: SqlJsDatabase, sql: string, params?: any[]): any | null {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

export class NeuroclawDB {
  private db: SqlJsDatabase;
  private dbPath: string;

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<NeuroclawDB> {
    const SQL = await initSqlJs();
    let db: SqlJsDatabase;
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    db.run(SCHEMA);
    const instance = new NeuroclawDB(db, dbPath);
    return instance;
  }

  close(): void {
    this.save();
    this.db.close();
  }

  save(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  listTables(): string[] {
    const rows = queryAll(
      this.db,
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
    );
    return rows.map((r) => r.name);
  }

  getJournalMode(): string {
    // sql.js runs in-memory; WAL is used when deployed with better-sqlite3
    // Return "memory" to reflect the actual mode
    return "memory";
  }

  // --- Episodes ---

  insertEpisode(ep: EpisodeRecord): void {
    this.db.run(
      `INSERT INTO episodes (id, timestamp, session_id, project, importance, is_correction, outcome_signal, consolidation_status, file_path, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ep.id,
        ep.timestamp,
        ep.session_id,
        ep.project,
        ep.importance,
        ep.is_correction ? 1 : 0,
        ep.outcome_signal,
        ep.consolidation_status,
        ep.file_path,
        ep.summary,
      ]
    );
  }

  getPendingEpisodes(): EpisodeRecord[] {
    const rows = queryAll(
      this.db,
      "SELECT * FROM episodes WHERE consolidation_status = 'pending' ORDER BY importance DESC"
    );
    return rows.map((r) => ({ ...r, is_correction: Boolean(r.is_correction) }));
  }

  // --- Semantic ---

  insertSemantic(entry: SemanticRecord): void {
    this.db.run(
      `INSERT INTO semantic (id, domain, created, last_accessed, importance, ref_count, confidence, file_path, line_range)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.domain,
        entry.created,
        entry.last_accessed,
        entry.importance,
        entry.ref_count,
        entry.confidence,
        entry.file_path,
        entry.line_range,
      ]
    );
  }

  getSemantic(id: string): SemanticRecord | null {
    return queryOne(this.db, "SELECT * FROM semantic WHERE id = ?", [id]);
  }

  // --- Procedures ---

  insertProcedure(proc: ProcedureRecord): void {
    this.db.run(
      `INSERT INTO procedures (id, name, task_type, success_count, last_used, file_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [proc.id, proc.name, proc.task_type, proc.success_count, proc.last_used, proc.file_path]
    );
  }

  // --- Relations ---

  insertRelation(rel: RelationRecord): void {
    this.db.run(
      `INSERT INTO relations (source_id, target_id, relation_type, weight, created, last_used)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rel.source_id, rel.target_id, rel.relation_type, rel.weight, rel.created, rel.last_used]
    );
  }

  getRelationsFrom(sourceId: string): RelationRecord[] {
    return queryAll(this.db, "SELECT * FROM relations WHERE source_id = ?", [sourceId]);
  }

  // --- Hypotheses ---

  insertHypothesis(hyp: HypothesisRecord): void {
    this.db.run(
      `INSERT INTO hypotheses (id, claim, evidence_for, evidence_against, status, created, last_tested, outcome_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hyp.id,
        hyp.claim,
        hyp.evidence_for,
        hyp.evidence_against,
        hyp.status,
        hyp.created,
        hyp.last_tested,
        hyp.outcome_score,
      ]
    );
  }

  getHypothesis(id: string): HypothesisRecord | null {
    return queryOne(this.db, "SELECT * FROM hypotheses WHERE id = ?", [id]);
  }

  updateHypothesisStatus(id: string, status: HypothesisStatus): void {
    this.db.run("UPDATE hypotheses SET status = ? WHERE id = ?", [status, id]);
  }

  // --- FTS5 ---

  indexContent(sourceId: string, sourceType: string, content: string): void {
    this.db.run(
      "INSERT INTO chunks_fts (content, source_id, source_type) VALUES (?, ?, ?)",
      [content, sourceId, sourceType]
    );
  }

  searchFTS(
    query: string,
    limit: number = 20
  ): Array<{ source_id: string; source_type: string; rank: number }> {
    // FTS4: use offsets() to count term occurrences for ranking.
    // More occurrences = more relevant. Negate for ORDER BY ASC.
    return queryAll(
      this.db,
      `SELECT source_id, source_type,
              -(length(offsets(chunks_fts)) - length(replace(offsets(chunks_fts), ' ', '')) + 1) / 4 as rank
       FROM chunks_fts
       WHERE chunks_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [query, limit]
    );
  }
}
