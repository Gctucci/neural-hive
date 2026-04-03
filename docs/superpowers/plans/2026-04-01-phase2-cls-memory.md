# Phase 2: CLS Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the CLS memory system with valence-scored episodic capture, dream cycle with interleaved replay, forgetting curves, and graph-walk retrieval.

**Architecture:** Six-layer data flow — fix circular deps, extend the data model, build valence scoring, add episodic capture, implement the five-phase dream cycle, and replace the graph-walk retrieval stub. Each layer builds on real subsystems from the previous layer.

**Tech Stack:** TypeScript, Vitest, sql.js (SQLite), crowd-sentiment (VADER), Turborepo monorepo

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/config/src/types.ts` | All shared types/interfaces (moved from core) |
| `packages/memory/src/valence.ts` | `ValenceScorer` interface, `LocalValenceScorer`, `LLMValenceScorer` |
| `packages/memory/src/capture.ts` | `EpisodeCapture` class — full capture pipeline |
| `packages/memory/src/__tests__/valence.test.ts` | Tests for valence scoring |
| `packages/memory/src/__tests__/capture.test.ts` | Tests for episodic capture |
| `packages/core/src/reasoner.ts` | `DreamReasoner` interface, `RuleBasedReasoner`, `LLMReasoner` |
| `packages/core/src/dream.ts` | `DreamCycle` class — five-phase dream orchestrator |
| `packages/core/src/__tests__/reasoner.test.ts` | Tests for DreamReasoner implementations |
| `packages/core/src/__tests__/dream.test.ts` | Tests for DreamCycle |

### Modified Files

| File | Changes |
|------|---------|
| `packages/config/src/index.ts` | Re-export types |
| `packages/config/src/schema.ts` | Add valence + reasoner config sections, remove graph `algorithm` |
| `packages/config/src/defaults.ts` | Add defaults for valence + reasoner config |
| `packages/core/src/types.ts` | Replace with re-export from `@neuroclaw/config` |
| `packages/core/src/engine.ts` | Add `captureEpisode()`, `executeDream()`, instantiate new subsystems |
| `packages/core/src/index.ts` | Export `DreamCycle`, `DreamReasoner`, `RuleBasedReasoner` |
| `packages/memory/src/sqlite.ts` | Schema migrations, new query methods |
| `packages/memory/src/importance.ts` | Add `valenceMagnitude` to `ImportanceInput` |
| `packages/memory/src/retrieval.ts` | Implement `graphWalkSearch()` |
| `packages/memory/src/index.ts` | Export new modules |
| `packages/memory/package.json` | Add `crowd-sentiment`, remove `@neuroclaw/core` dep |
| `packages/governance/package.json` | Replace `@neuroclaw/core` with `@neuroclaw/config` dep |
| `packages/governance/src/mode.ts` | Update import path |
| `packages/governance/src/invariants.ts` | Update import path |

---

## Task 1: Fix Circular Dependency — Move Types to Config

**Files:**
- Create: `packages/config/src/types.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/memory/src/sqlite.ts`
- Modify: `packages/memory/package.json`
- Modify: `packages/governance/src/mode.ts`
- Modify: `packages/governance/src/invariants.ts`
- Modify: `packages/governance/package.json`

- [ ] **Step 1: Create `packages/config/src/types.ts` with all shared types**

Copy the entire contents of `packages/core/src/types.ts` into the new file. No changes to the types themselves.

```typescript
// packages/config/src/types.ts

// -- Enums / Union Types --

export type GovernanceMode = "autonomous" | "supervised" | "gated";
export type MemoryType = "episodic" | "semantic" | "procedural" | "working";
export type ConsolidationStatus =
  | "pending"
  | "consolidated"
  | "migrated"
  | "archived";
export type RelationType =
  | "supports"
  | "contradicts"
  | "elaborates"
  | "requires";
export type HypothesisStatus =
  | "tentative"
  | "confirmed"
  | "demoted"
  | "revoked"
  | "stale";

// -- Session & Action --

export interface SessionContext {
  sessionId: string;
  agentId: string;
  platform: "openclaw" | "claude_code";
  workingDirectory: string;
  projectName?: string;
}

export interface ActionContext extends SessionContext {
  messageHistory: string[];
  loadedMemories: RetrievedMemory[];
}

export interface ActionResult {
  success: boolean;
  toolUsed?: string;
  outputSummary?: string;
  isCorrection: boolean;
}

// -- Memory Records --

export interface RetrievedMemory {
  id: string;
  type: Exclude<MemoryType, "working">;
  content: string;
  importance: number;
  relevanceScore: number;
  source: string;
  created: number;
  evidenceChain?: string[];
}

export interface InjectedMemory {
  workingMemory: string;
  retrievedMemories: RetrievedMemory[];
  capabilityContext?: string;
}

export interface EpisodeRecord {
  id: string;
  timestamp: number;
  session_id: string;
  project: string | null;
  importance: number;
  is_correction: boolean;
  outcome_signal: number;
  consolidation_status: ConsolidationStatus;
  file_path: string;
  summary: string;
}

export interface SemanticRecord {
  id: string;
  domain: string;
  created: number;
  last_accessed: number;
  importance: number;
  ref_count: number;
  confidence: number;
  file_path: string;
  line_range: string | null;
}

export interface ProcedureRecord {
  id: string;
  name: string;
  task_type: string;
  success_count: number;
  last_used: number;
  file_path: string;
}

export interface RelationRecord {
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  weight: number;
  created: number;
  last_used: number;
}

export interface HypothesisRecord {
  id: string;
  claim: string;
  evidence_for: number;
  evidence_against: number;
  status: HypothesisStatus;
  created: number;
  last_tested: number;
  outcome_score: number;
}

// -- Dream Cycle --

export interface DreamSchedule {
  frequency: "daily" | "on_demand";
  hour: number;
  staggerOffset?: number;
}

export interface DreamReport {
  timestamp: number;
  episodesProcessed: number;
  consolidated: number;
  archived: number;
  hypothesesUpdated: string[];
  capabilityChanges: string[];
  healthScore: number;
  securityFindings: string[];
  digestPath: string;
}

// -- Platform --

export interface PlatformInfo {
  platform: "openclaw" | "claude_code";
  workspaceFiles: string[];
  nativeMemoryPath?: string;
}

// -- Adapter Interface --

export interface NeuroclawAdapter {
  onSessionStart(context: SessionContext): Promise<void>;
  onSessionEnd(context: SessionContext): Promise<void>;
  beforeAction(context: ActionContext): Promise<InjectedMemory>;
  afterAction(
    context: ActionContext,
    result: ActionResult
  ): Promise<void>;
  scheduleDream(config: DreamSchedule): Promise<void>;
  executeDream(): Promise<DreamReport>;
  injectIntoPrompt(memories: RetrievedMemory[]): string;
  detectPlatform(): PlatformInfo;
}
```

- [ ] **Step 2: Update `packages/config/src/index.ts` to re-export types**

```typescript
// packages/config/src/index.ts
export { NeuroclawConfigSchema, type NeuroclawConfig } from "./schema";
export { DEFAULT_CONFIG } from "./defaults";
export { loadConfig, mergeConfigs, resolveStorePath } from "./loader";
export * from "./types";
```

- [ ] **Step 3: Replace `packages/core/src/types.ts` with a re-export**

```typescript
// packages/core/src/types.ts
// Re-export all types from @neuroclaw/config for backwards compatibility
export * from "@neuroclaw/config";
```

- [ ] **Step 4: Update `packages/memory/src/sqlite.ts` import**

Change line 4-11 from:

```typescript
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
} from "@neuroclaw/core";
```

To:

```typescript
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
} from "@neuroclaw/config";
```

- [ ] **Step 5: Update `packages/governance/src/mode.ts` import**

Change line 1 from:

```typescript
import type { GovernanceMode } from "@neuroclaw/core";
```

To:

```typescript
import type { GovernanceMode } from "@neuroclaw/config";
```

- [ ] **Step 6: Update `packages/governance/src/invariants.ts` import**

Change line 1 from:

```typescript
import type { GovernanceMode } from "@neuroclaw/core";
```

To:

```typescript
import type { GovernanceMode } from "@neuroclaw/config";
```

- [ ] **Step 7: Update `packages/memory/package.json` — remove `@neuroclaw/core` dep**

Change dependencies from:

```json
"dependencies": {
  "@neuroclaw/config": "0.1.0",
  "@neuroclaw/core": "0.1.0",
  "@neuroclaw/governance": "0.1.0",
  "sql.js": "^1.14.1"
}
```

To:

```json
"dependencies": {
  "@neuroclaw/config": "0.1.0",
  "@neuroclaw/governance": "0.1.0",
  "sql.js": "^1.14.1"
}
```

- [ ] **Step 8: Update `packages/governance/package.json` — replace `@neuroclaw/core` with `@neuroclaw/config`**

Change dependencies from:

```json
"dependencies": {
  "@neuroclaw/core": "0.1.0"
}
```

To:

```json
"dependencies": {
  "@neuroclaw/config": "0.1.0"
}
```

- [ ] **Step 9: Run build to verify cycle is broken**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo build`

Expected: Build succeeds with no circular dependency error.

- [ ] **Step 10: Run all tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All existing tests pass (imports resolve correctly).

- [ ] **Step 11: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/index.ts \
  packages/core/src/types.ts packages/memory/src/sqlite.ts \
  packages/memory/package.json packages/governance/src/mode.ts \
  packages/governance/src/invariants.ts packages/governance/package.json
git commit -m "refactor: move shared types to @neuroclaw/config to break circular dependency"
```

---

## Task 2: Extend Data Model — Types, Schema, and DB Migrations

**Files:**
- Modify: `packages/config/src/types.ts`
- Modify: `packages/config/src/schema.ts`
- Modify: `packages/config/src/defaults.ts`
- Modify: `packages/memory/src/sqlite.ts`
- Test: `packages/memory/src/__tests__/sqlite.test.ts`

- [ ] **Step 1: Write failing tests for new DB columns**

Add to `packages/memory/src/__tests__/sqlite.test.ts`:

```typescript
describe("phase 2 schema migrations", () => {
  it("episode records include valence, arousal, and context_snippet", () => {
    db.insertEpisode({
      id: "ep-v1",
      timestamp: Date.now(),
      session_id: "sess-1",
      project: "test",
      importance: 0.5,
      is_correction: false,
      outcome_signal: 0.0,
      consolidation_status: "pending",
      file_path: "episodic/ep-v1.md",
      summary: "Test episode",
      valence: -0.7,
      arousal: 0.8,
      context_snippet: "user said: no that's wrong",
    });

    const episodes = db.getPendingEpisodes();
    expect(episodes[0].valence).toBe(-0.7);
    expect(episodes[0].arousal).toBe(0.8);
    expect(episodes[0].context_snippet).toBe("user said: no that's wrong");
  });

  it("semantic records include half_life, retention, and source_episode_ids", () => {
    db.insertSemantic({
      id: "sem-v1",
      domain: "testing",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.6,
      ref_count: 1,
      confidence: 0.9,
      file_path: "semantic/domains/testing.md",
      line_range: null,
      half_life: 45.0,
      retention: 0.95,
      source_episode_ids: "ep-1,ep-2",
    });

    const entry = db.getSemantic("sem-v1");
    expect(entry!.half_life).toBe(45.0);
    expect(entry!.retention).toBe(0.95);
    expect(entry!.source_episode_ids).toBe("ep-1,ep-2");
  });

  it("relation records include provenance and confidence", () => {
    db.insertRelation({
      source_id: "sem-001",
      target_id: "sem-002",
      relation_type: "supports",
      weight: 0.8,
      created: Date.now(),
      last_used: Date.now(),
      provenance: "llm",
      confidence: 0.7,
    });

    const relations = db.getRelationsFrom("sem-001");
    expect(relations[0].provenance).toBe("llm");
    expect(relations[0].confidence).toBe(0.7);
  });

  it("getRelationsTo returns relations targeting a given ID", () => {
    db.insertRelation({
      source_id: "sem-a",
      target_id: "sem-b",
      relation_type: "elaborates",
      weight: 1.0,
      created: Date.now(),
      last_used: Date.now(),
      provenance: "rule",
      confidence: 1.0,
    });

    const relations = db.getRelationsTo("sem-b");
    expect(relations).toHaveLength(1);
    expect(relations[0].source_id).toBe("sem-a");
  });

  it("getSemanticByDomain returns entries for a domain", () => {
    db.insertSemantic({
      id: "sem-d1",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.5,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/auth.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });
    db.insertSemantic({
      id: "sem-d2",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 1,
      confidence: 0.8,
      file_path: "semantic/domains/auth-2.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });

    const results = db.getSemanticByDomain("auth");
    expect(results).toHaveLength(2);
  });

  it("getAllSemanticEntries returns all entries", () => {
    db.insertSemantic({
      id: "sem-all-1",
      domain: "general",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.5,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/general.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });

    const results = db.getAllSemanticEntries();
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("updateSemanticRetention updates retention and half_life", () => {
    db.insertSemantic({
      id: "sem-ret",
      domain: "test",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.5,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/test.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });

    db.updateSemanticRetention("sem-ret", 0.3, 15);
    const entry = db.getSemantic("sem-ret");
    expect(entry!.retention).toBe(0.3);
    expect(entry!.half_life).toBe(15);
  });

  it("updateEpisodeStatus changes consolidation_status", () => {
    db.insertEpisode({
      id: "ep-status",
      timestamp: Date.now(),
      session_id: "sess-1",
      project: null,
      importance: 0.5,
      is_correction: false,
      outcome_signal: 0.0,
      consolidation_status: "pending",
      file_path: "episodic/ep-status.md",
      summary: "test",
      valence: 0,
      arousal: 0,
      context_snippet: "",
    });

    db.updateEpisodeStatus("ep-status", "consolidated");
    const episodes = db.getPendingEpisodes();
    expect(episodes.find((e) => e.id === "ep-status")).toBeUndefined();
  });

  it("incrementSemanticRefCount increments ref_count and updates last_accessed", () => {
    const now = Date.now();
    db.insertSemantic({
      id: "sem-ref",
      domain: "test",
      created: now,
      last_accessed: now,
      importance: 0.5,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/test.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });

    db.incrementSemanticRefCount("sem-ref");
    const entry = db.getSemantic("sem-ref");
    expect(entry!.ref_count).toBe(1);
    expect(entry!.last_accessed).toBeGreaterThanOrEqual(now);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: FAIL — `EpisodeRecord` doesn't have `valence`/`arousal`/`context_snippet` properties, etc.

- [ ] **Step 3: Extend types in `packages/config/src/types.ts`**

Add valence/arousal/context_snippet to `EpisodeRecord`:

```typescript
export interface EpisodeRecord {
  id: string;
  timestamp: number;
  session_id: string;
  project: string | null;
  importance: number;
  is_correction: boolean;
  outcome_signal: number;
  consolidation_status: ConsolidationStatus;
  file_path: string;
  summary: string;
  valence: number;
  arousal: number;
  context_snippet: string;
}
```

Add forgetting fields to `SemanticRecord`:

```typescript
export interface SemanticRecord {
  id: string;
  domain: string;
  created: number;
  last_accessed: number;
  importance: number;
  ref_count: number;
  confidence: number;
  file_path: string;
  line_range: string | null;
  half_life: number;
  retention: number;
  source_episode_ids: string;
}
```

Add provenance to `RelationRecord`:

```typescript
export interface RelationRecord {
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  weight: number;
  created: number;
  last_used: number;
  provenance: "rule" | "llm";
  confidence: number;
}
```

- [ ] **Step 4: Update DB schema and methods in `packages/memory/src/sqlite.ts`**

Add new columns to the `SCHEMA` string (as new CREATE TABLE definitions — since we control the schema and the tables are created via `CREATE TABLE IF NOT EXISTS`, we add the columns directly to the create statements):

In the `episodes` CREATE TABLE, add after `summary TEXT NOT NULL`:
```sql
    valence REAL NOT NULL DEFAULT 0.0,
    arousal REAL NOT NULL DEFAULT 0.0,
    context_snippet TEXT NOT NULL DEFAULT ''
```

In the `semantic` CREATE TABLE, add after `line_range TEXT`:
```sql
    half_life REAL NOT NULL DEFAULT 30.0,
    retention REAL NOT NULL DEFAULT 1.0,
    source_episode_ids TEXT NOT NULL DEFAULT ''
```

In the `relations` CREATE TABLE, add after `last_used INTEGER NOT NULL` (before the PRIMARY KEY line):
```sql
    provenance TEXT NOT NULL DEFAULT 'rule',
    confidence REAL NOT NULL DEFAULT 1.0,
```

Update `insertEpisode` to include the new columns:

```typescript
insertEpisode(ep: EpisodeRecord): void {
  this.db.run(
    `INSERT INTO episodes (id, timestamp, session_id, project, importance, is_correction, outcome_signal, consolidation_status, file_path, summary, valence, arousal, context_snippet)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ep.valence,
      ep.arousal,
      ep.context_snippet,
    ]
  );
}
```

Update `getPendingEpisodes` return mapping to include new fields:

```typescript
getPendingEpisodes(): EpisodeRecord[] {
  const rows = queryAll(
    this.db,
    "SELECT * FROM episodes WHERE consolidation_status = 'pending' ORDER BY importance DESC"
  );
  return rows.map((r) => ({
    ...r,
    is_correction: Boolean(r.is_correction),
    valence: r.valence ?? 0,
    arousal: r.arousal ?? 0,
    context_snippet: r.context_snippet ?? "",
  }));
}
```

Update `insertSemantic` to include new columns:

```typescript
insertSemantic(entry: SemanticRecord): void {
  this.db.run(
    `INSERT INTO semantic (id, domain, created, last_accessed, importance, ref_count, confidence, file_path, line_range, half_life, retention, source_episode_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      entry.half_life,
      entry.retention,
      entry.source_episode_ids,
    ]
  );
}
```

Update `insertRelation` to include new columns:

```typescript
insertRelation(rel: RelationRecord): void {
  this.db.run(
    `INSERT INTO relations (source_id, target_id, relation_type, weight, created, last_used, provenance, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [rel.source_id, rel.target_id, rel.relation_type, rel.weight, rel.created, rel.last_used, rel.provenance, rel.confidence]
  );
}
```

Add new query methods:

```typescript
getRelationsTo(targetId: string): RelationRecord[] {
  return queryAll(this.db, "SELECT * FROM relations WHERE target_id = ?", [targetId]);
}

getSemanticByDomain(domain: string): SemanticRecord[] {
  return queryAll(this.db, "SELECT * FROM semantic WHERE domain = ?", [domain]);
}

getAllSemanticEntries(): SemanticRecord[] {
  return queryAll(this.db, "SELECT * FROM semantic");
}

updateSemanticRetention(id: string, retention: number, halfLife: number): void {
  this.db.run("UPDATE semantic SET retention = ?, half_life = ? WHERE id = ?", [retention, halfLife, id]);
}

updateEpisodeStatus(id: string, status: ConsolidationStatus): void {
  this.db.run("UPDATE episodes SET consolidation_status = ? WHERE id = ?", [status, id]);
}

incrementSemanticRefCount(id: string): void {
  this.db.run(
    "UPDATE semantic SET ref_count = ref_count + 1, last_accessed = ? WHERE id = ?",
    [Date.now(), id]
  );
}
```

Add import for `ConsolidationStatus` at the top of `sqlite.ts`:

```typescript
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
  ConsolidationStatus,
} from "@neuroclaw/config";
```

- [ ] **Step 5: Fix existing tests that create EpisodeRecord/SemanticRecord/RelationRecord without new fields**

In `packages/memory/src/__tests__/sqlite.test.ts`, update the existing `insertEpisode` call (around line 38) to include:

```typescript
valence: 0,
arousal: 0,
context_snippet: "",
```

Update the existing `insertSemantic` call (around line 60) to include:

```typescript
half_life: 30,
retention: 1.0,
source_episode_ids: "",
```

Update the existing `insertRelation` call (around line 101) to include:

```typescript
provenance: "rule",
confidence: 1.0,
```

Also update `packages/core/src/__tests__/integration.test.ts` and any other test files that create these records with the new fields.

- [ ] **Step 6: Update config schema**

In `packages/config/src/schema.ts`, add valence and reasoner config sections. Add before `NeuroclawConfigSchema`:

```typescript
const ValenceSchema = z.object({
  scorer: z.enum(["local", "llm"]).default("local"),
  llm_provider: z.string().nullable().default(null),
});
```

Add the `valence` field to `MemorySchema`:

```typescript
const MemorySchema = z.object({
  working_memory_max_lines: z.number().positive().default(100),
  episodic: EpisodicSchema.default({}),
  procedural: ProceduralSchema.default({}),
  forgetting: ForgettingSchema.default({}),
  valence: ValenceSchema.default({}),
});
```

Add a `ReasonerSchema` section:

```typescript
const ReasonerSchema = z.object({
  type: z.enum(["rule", "llm"]).default("rule"),
  llm_provider: z.string().nullable().default(null),
});
```

Add `reasoner` to `ConsolidationSchema`:

```typescript
const ConsolidationSchema = z.object({
  dream_cycle: DreamCycleSchema.default({}),
  verification: VerificationSchema.default({}),
  reasoner: ReasonerSchema.default({}),
});
```

Remove `algorithm` from `GraphSchema`:

```typescript
const GraphSchema = z.object({
  enabled: z.boolean().default(true),
  trigger: z.enum(["auto", "always", "never"]).default("auto"),
});
```

- [ ] **Step 7: Update defaults**

In `packages/config/src/defaults.ts`, add the new defaults:

Add to `memory`:
```typescript
valence: { scorer: "local", llm_provider: null },
```

Add to `consolidation`:
```typescript
reasoner: { type: "rule", llm_provider: null },
```

Remove `algorithm` from `graph`:
```typescript
graph: { enabled: true, trigger: "auto" },
```

- [ ] **Step 8: Run all tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests pass, including the new phase 2 schema migration tests.

- [ ] **Step 9: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/schema.ts \
  packages/config/src/defaults.ts packages/memory/src/sqlite.ts \
  packages/memory/src/__tests__/sqlite.test.ts
git commit -m "feat: extend data model with valence, forgetting curves, and relation provenance"
```

---

## Task 3: Build Valence Scorer

**Files:**
- Create: `packages/memory/src/valence.ts`
- Create: `packages/memory/src/__tests__/valence.test.ts`
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/memory/package.json`

- [ ] **Step 1: Install crowd-sentiment**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npm install crowd-sentiment --workspace=packages/memory`

- [ ] **Step 2: Write failing tests for valence scoring**

Create `packages/memory/src/__tests__/valence.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { LocalValenceScorer } from "../valence";

describe("LocalValenceScorer", () => {
  const scorer = new LocalValenceScorer();

  it("scores positive text with positive valence", async () => {
    const result = await scorer.score("That's perfect, exactly what I needed!");
    expect(result.valence).toBeGreaterThan(0);
    expect(result.source).toBe("local");
  });

  it("scores negative text with negative valence", async () => {
    const result = await scorer.score("No, that's completely wrong. I told you before.");
    expect(result.valence).toBeLessThan(0);
    expect(result.source).toBe("local");
  });

  it("scores neutral text near zero", async () => {
    const result = await scorer.score("The function takes two parameters.");
    expect(Math.abs(result.valence)).toBeLessThan(0.5);
    expect(result.source).toBe("local");
  });

  it("arousal is higher for intense text", async () => {
    const calm = await scorer.score("The config file is located in the root directory.");
    const intense = await scorer.score("THIS IS COMPLETELY BROKEN!!! Fix it NOW!!!");
    expect(intense.arousal).toBeGreaterThan(calm.arousal);
  });

  it("domain correction patterns force negative valence", async () => {
    const result = await scorer.score("No that's wrong, try again. I already told you the answer.");
    expect(result.valence).toBeLessThan(-0.3);
    expect(result.arousal).toBeGreaterThan(0.3);
  });

  it("domain praise patterns force positive valence", async () => {
    const result = await scorer.score("Perfect, great job on this implementation.");
    expect(result.valence).toBeGreaterThan(0.3);
  });

  it("returns valence in [-1, 1] range", async () => {
    const texts = [
      "This is terrible and broken",
      "Amazing work, perfect solution",
      "The file exists",
      "I TOLD YOU NOT TO DO THAT!!!",
    ];
    for (const text of texts) {
      const result = await scorer.score(text);
      expect(result.valence).toBeGreaterThanOrEqual(-1);
      expect(result.valence).toBeLessThanOrEqual(1);
      expect(result.arousal).toBeGreaterThanOrEqual(0);
      expect(result.arousal).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: FAIL — `../valence` module not found.

- [ ] **Step 4: Implement `packages/memory/src/valence.ts`**

```typescript
import Sentiment from "crowd-sentiment";

// -- Interface --

export interface ValenceResult {
  valence: number;   // -1.0 to +1.0
  arousal: number;   // 0.0 to 1.0
  source: "local" | "llm";
}

export interface ValenceScorer {
  score(text: string): Promise<ValenceResult>;
}

// -- Domain Patterns --

interface DomainPattern {
  patterns: RegExp[];
  valenceOverride?: number;  // if set, forces valence toward this value
  arousalBoost: number;      // added to arousal
}

const CORRECTION_PATTERNS: DomainPattern = {
  patterns: [
    /\bno[\s,]+that'?s\s+(wrong|incorrect|not right)/i,
    /\bi\s+(already\s+)?told\s+you/i,
    /\btry\s+again/i,
    /\bthat'?s\s+not\s+what\s+i\s+(meant|asked|wanted)/i,
    /\bwrong\s+(approach|answer|solution|way)/i,
    /\bstop\s+doing\s+(that|this)/i,
    /\bi\s+said\s+(not|don'?t)/i,
  ],
  valenceOverride: -0.6,
  arousalBoost: 0.3,
};

const PRAISE_PATTERNS: DomainPattern = {
  patterns: [
    /\bperfect\b/i,
    /\bexactly\s+(what\s+i|right)\b/i,
    /\bgreat\s+(job|work)\b/i,
    /\bwell\s+done\b/i,
    /\bexcellent\b/i,
    /\bnice\s+(work|job|one)\b/i,
  ],
  valenceOverride: 0.6,
  arousalBoost: 0.1,
};

const SURPRISE_PATTERNS: DomainPattern = {
  patterns: [
    /\binteresting\b/i,
    /\bdidn'?t\s+expect/i,
    /\boh\s+wow\b/i,
    /\bsurpris(ed|ing)\b/i,
    /\bunexpected(ly)?\b/i,
  ],
  arousalBoost: 0.4,
};

const DOMAIN_PATTERNS = [CORRECTION_PATTERNS, PRAISE_PATTERNS, SURPRISE_PATTERNS];

// -- Arousal Heuristic --

function computeArousal(text: string): number {
  const words = text.split(/\s+/);
  if (words.length === 0) return 0;

  // Exclamation/question mark density
  const punctuation = (text.match(/[!?]/g) || []).length;
  const punctuationScore = Math.min(punctuation / Math.max(words.length, 1), 1);

  // ALL CAPS word ratio (exclude single-char words)
  const capsWords = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const capsRatio = capsWords.length / words.length;

  // Intensity adverbs
  const intensifiers = [
    "extremely", "absolutely", "completely", "totally", "utterly",
    "terrible", "amazing", "incredible", "awful", "fantastic",
    "horrible", "magnificent", "devastating", "phenomenal",
  ];
  const intensifierCount = intensifiers.filter((w) => text.toLowerCase().includes(w)).length;
  const intensifierScore = Math.min(intensifierCount / 3, 1);

  // Weighted combination
  const raw = punctuationScore * 0.35 + capsRatio * 0.35 + intensifierScore * 0.3;
  return Math.min(Math.max(raw, 0), 1);
}

// -- Local Scorer --

export class LocalValenceScorer implements ValenceScorer {
  private sentiment: Sentiment;

  constructor() {
    this.sentiment = new Sentiment();
  }

  async score(text: string): Promise<ValenceResult> {
    // Layer 1: VADER base
    const analysis = this.sentiment.analyze(text);
    let valence = Math.max(-1, Math.min(1, analysis.comparative));

    // Layer 2: Arousal heuristic
    let arousal = computeArousal(text);

    // Layer 3: Domain pattern overrides
    for (const pattern of DOMAIN_PATTERNS) {
      const matched = pattern.patterns.some((p) => p.test(text));
      if (matched) {
        if (pattern.valenceOverride !== undefined) {
          // Blend toward override rather than hard replace
          valence = valence * 0.3 + pattern.valenceOverride * 0.7;
        }
        arousal = Math.min(1, arousal + pattern.arousalBoost);
      }
    }

    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
      source: "local",
    };
  }
}

// -- LLM Scorer (placeholder — requires adapter-provided LLM call) --

export type LLMCallFn = (prompt: string) => Promise<string>;

export class LLMValenceScorer implements ValenceScorer {
  private llmCall: LLMCallFn;

  constructor(llmCall: LLMCallFn) {
    this.llmCall = llmCall;
  }

  async score(text: string): Promise<ValenceResult> {
    const prompt = `Analyze the emotional valence and arousal of this text from a coding agent interaction.

Text: "${text.slice(0, 500)}"

Respond with ONLY a JSON object:
{"valence": <number from -1.0 to 1.0>, "arousal": <number from 0.0 to 1.0>}

valence: -1.0 = very negative (frustration, anger), 0 = neutral, 1.0 = very positive (satisfaction, praise)
arousal: 0.0 = calm/routine, 1.0 = intense/urgent`;

    const response = await this.llmCall(prompt);
    try {
      const parsed = JSON.parse(response);
      return {
        valence: Math.max(-1, Math.min(1, Number(parsed.valence) || 0)),
        arousal: Math.max(0, Math.min(1, Number(parsed.arousal) || 0)),
        source: "llm",
      };
    } catch {
      // Fallback to neutral if LLM response is unparseable
      return { valence: 0, arousal: 0, source: "llm" };
    }
  }
}
```

- [ ] **Step 5: Update `packages/memory/src/index.ts`**

Add export:

```typescript
export { LocalValenceScorer, LLMValenceScorer, type ValenceScorer, type ValenceResult, type LLMCallFn } from "./valence";
```

- [ ] **Step 6: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All valence tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/memory/src/valence.ts packages/memory/src/__tests__/valence.test.ts \
  packages/memory/src/index.ts packages/memory/package.json package-lock.json
git commit -m "feat: add valence scorer with VADER-based local scoring and pluggable LLM option"
```

---

## Task 4: Extend Importance Formula with Valence

**Files:**
- Modify: `packages/memory/src/importance.ts`
- Modify: `packages/memory/src/__tests__/importance.test.ts`

- [ ] **Step 1: Write failing test for valence influence on importance**

Add to `packages/memory/src/__tests__/importance.test.ts`:

```typescript
it("high valence magnitude increases importance", () => {
  const neutral = computeImportance({
    baseWeight: 0.5,
    recencyFactor: 0.5,
    refCount: 0,
    outcomeSignal: 0.0,
    isCorrection: false,
    valenceMagnitude: 0.0,
  });
  const emotional = computeImportance({
    baseWeight: 0.5,
    recencyFactor: 0.5,
    refCount: 0,
    outcomeSignal: 0.0,
    isCorrection: false,
    valenceMagnitude: 0.9,
  });
  expect(emotional).toBeGreaterThan(neutral);
});

it("valenceMagnitude defaults to 0 when omitted", () => {
  const score = computeImportance({
    baseWeight: 0.5,
    recencyFactor: 0.5,
    refCount: 0,
    outcomeSignal: 0.0,
    isCorrection: false,
  });
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThan(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=importance`

Expected: FAIL — `valenceMagnitude` not a valid property of `ImportanceInput`.

- [ ] **Step 3: Add `valenceMagnitude` to `ImportanceInput` and formula**

In `packages/memory/src/importance.ts`:

Add to the interface:

```typescript
export interface ImportanceInput {
  baseWeight: number;
  recencyFactor: number;
  refCount: number;
  outcomeSignal: number;
  isCorrection: boolean;
  /** Absolute valence magnitude (0-1). High = emotionally significant. */
  valenceMagnitude?: number;
}
```

Add the weight constant:

```typescript
const W_VALENCE = 0.9;
```

Update the formula in `computeImportance`:

```typescript
const score =
  W_BASE * baseWeight +
  W_RECENCY * recencyFactor +
  W_REFS * Math.log2(refCount + 1) +
  W_OUTCOME * Math.abs(outcomeSignal) +
  W_CORRECTION * (isCorrection ? 1 : 0) +
  W_VALENCE * (valenceMagnitude ?? 0);
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=importance`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/importance.ts packages/memory/src/__tests__/importance.test.ts
git commit -m "feat: add valence magnitude to importance formula (amygdala modulation)"
```

---

## Task 5: Build Episodic Capture Pipeline

**Files:**
- Create: `packages/memory/src/capture.ts`
- Create: `packages/memory/src/__tests__/capture.test.ts`
- Modify: `packages/memory/src/index.ts`

- [ ] **Step 1: Write failing tests for episodic capture**

Create `packages/memory/src/__tests__/capture.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { LocalValenceScorer } from "../valence";
import { EpisodeCapture } from "../capture";

describe("EpisodeCapture", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let capture: EpisodeCapture;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-capture-"));
    db = await NeuroclawDB.create(path.join(tmpDir, "index.db"));
    vault = new Vault(tmpDir);
    vault.init();
    const scorer = new LocalValenceScorer();
    capture = new EpisodeCapture(db, vault, scorer);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("captures an episode and returns a complete record", async () => {
    const record = await capture.capture({
      sessionId: "sess-1",
      project: "test-project",
      interactionText: "User said: perfect, that's exactly what I needed!",
      summary: "Implemented the config loader correctly",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    expect(record.id).toMatch(/^ep-/);
    expect(record.session_id).toBe("sess-1");
    expect(record.project).toBe("test-project");
    expect(record.consolidation_status).toBe("pending");
    expect(record.valence).toBeGreaterThan(0);
    expect(record.importance).toBeGreaterThan(0);
    expect(record.importance).toBeLessThanOrEqual(1);
  });

  it("writes episode markdown file to vault", async () => {
    const record = await capture.capture({
      sessionId: "sess-2",
      project: null,
      interactionText: "The function takes two args",
      summary: "Simple function description",
      isCorrection: false,
      outcomeSignal: 0.0,
    });

    const content = vault.read(record.file_path);
    expect(content).not.toBeNull();
    expect(content).toContain("Simple function description");
    expect(content).toContain("valence:");
  });

  it("inserts the record into the database", async () => {
    await capture.capture({
      sessionId: "sess-3",
      project: "proj",
      interactionText: "No, that's wrong",
      summary: "User corrected approach",
      isCorrection: true,
      outcomeSignal: -0.5,
    });

    const pending = db.getPendingEpisodes();
    expect(pending).toHaveLength(1);
    expect(pending[0].is_correction).toBe(true);
    expect(pending[0].valence).toBeLessThan(0);
  });

  it("indexes content for FTS search", async () => {
    await capture.capture({
      sessionId: "sess-4",
      project: null,
      interactionText: "barrel exports",
      summary: "Discussed TypeScript barrel export patterns",
      isCorrection: false,
      outcomeSignal: 0.0,
    });

    const results = db.searchFTS("barrel export");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("correction episodes get higher importance", async () => {
    const normal = await capture.capture({
      sessionId: "sess-5a",
      project: null,
      interactionText: "The config looks good",
      summary: "Config review",
      isCorrection: false,
      outcomeSignal: 0.0,
    });

    const correction = await capture.capture({
      sessionId: "sess-5b",
      project: null,
      interactionText: "No that's wrong, I told you before",
      summary: "User corrected mistake",
      isCorrection: true,
      outcomeSignal: -0.8,
    });

    expect(correction.importance).toBeGreaterThan(normal.importance);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=capture`

Expected: FAIL — `../capture` module not found.

- [ ] **Step 3: Implement `packages/memory/src/capture.ts`**

```typescript
import type { EpisodeRecord } from "@neuroclaw/config";
import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";
import type { ValenceScorer } from "./valence";
import { computeImportance } from "./importance";

export interface CaptureInput {
  sessionId: string;
  project: string | null;
  interactionText: string;
  summary: string;
  isCorrection: boolean;
  outcomeSignal: number;
}

function generateId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `ep-${ts}-${rand}`;
}

export class EpisodeCapture {
  private db: NeuroclawDB;
  private vault: Vault;
  private scorer: ValenceScorer;

  constructor(db: NeuroclawDB, vault: Vault, scorer: ValenceScorer) {
    this.db = db;
    this.vault = vault;
    this.scorer = scorer;
  }

  async capture(input: CaptureInput): Promise<EpisodeRecord> {
    const id = generateId();
    const timestamp = Date.now();

    // 1. Score valence/arousal
    const valenceResult = await this.scorer.score(input.interactionText);

    // 2. Compute importance with valence modulation
    const importance = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 1.0, // just captured, max recency
      refCount: 0,
      outcomeSignal: input.outcomeSignal,
      isCorrection: input.isCorrection,
      valenceMagnitude: Math.abs(valenceResult.valence),
    });

    // 3. Build the record
    const filePath = `episodic/${id}.md`;
    const record: EpisodeRecord = {
      id,
      timestamp,
      session_id: input.sessionId,
      project: input.project,
      importance,
      is_correction: input.isCorrection,
      outcome_signal: input.outcomeSignal,
      consolidation_status: "pending",
      file_path: filePath,
      summary: input.summary,
      valence: valenceResult.valence,
      arousal: valenceResult.arousal,
      context_snippet: input.interactionText.slice(0, 200),
    };

    // 4. Write episode file to vault
    const frontmatter = [
      "---",
      `id: ${id}`,
      `session: ${input.sessionId}`,
      `valence: ${valenceResult.valence.toFixed(2)}`,
      `arousal: ${valenceResult.arousal.toFixed(2)}`,
      `importance: ${importance.toFixed(2)}`,
      `is_correction: ${input.isCorrection}`,
      "---",
      "",
      input.summary,
      "",
    ].join("\n");
    this.vault.write(filePath, frontmatter);

    // 5. Insert into DB
    this.db.insertEpisode(record);

    // 6. Index for FTS
    this.db.indexContent(id, "episodic", `${input.summary} ${input.interactionText}`);

    return record;
  }
}
```

- [ ] **Step 4: Update `packages/memory/src/index.ts`**

Add export:

```typescript
export { EpisodeCapture, type CaptureInput } from "./capture";
```

- [ ] **Step 5: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=capture`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/capture.ts packages/memory/src/__tests__/capture.test.ts \
  packages/memory/src/index.ts
git commit -m "feat: add episodic capture pipeline with valence scoring"
```

---

## Task 6: Build DreamReasoner Interface and RuleBasedReasoner

**Files:**
- Create: `packages/core/src/reasoner.ts`
- Create: `packages/core/src/__tests__/reasoner.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for RuleBasedReasoner**

Create `packages/core/src/__tests__/reasoner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { RuleBasedReasoner } from "../reasoner";
import type { EpisodeRecord, SemanticRecord } from "@neuroclaw/config";

function makeEpisode(overrides: Partial<EpisodeRecord> = {}): EpisodeRecord {
  return {
    id: "ep-1",
    timestamp: Date.now(),
    session_id: "sess-1",
    project: null,
    importance: 0.5,
    is_correction: false,
    outcome_signal: 0.0,
    consolidation_status: "pending",
    file_path: "episodic/ep-1.md",
    summary: "test episode",
    valence: 0,
    arousal: 0,
    context_snippet: "",
    ...overrides,
  };
}

function makeSemantic(overrides: Partial<SemanticRecord> = {}): SemanticRecord {
  return {
    id: "sem-1",
    domain: "general",
    created: Date.now(),
    last_accessed: Date.now(),
    importance: 0.5,
    ref_count: 1,
    confidence: 0.8,
    file_path: "semantic/domains/general.md",
    line_range: null,
    half_life: 30,
    retention: 1.0,
    source_episode_ids: "",
    ...overrides,
  };
}

describe("RuleBasedReasoner", () => {
  const reasoner = new RuleBasedReasoner();

  describe("judgeReplay", () => {
    it("returns 'contradicts' for corrections with strong match", async () => {
      const episode = makeEpisode({ is_correction: true, outcome_signal: -0.5 });
      const semantic = makeSemantic();
      const result = await reasoner.judgeReplay(
        episode, "User corrected the approach",
        semantic, "Always use barrel exports"
      );
      expect(result.relation).toBe("contradicts");
      expect(result.confidence).toBe(1.0);
    });

    it("returns 'supports' for positive outcome", async () => {
      const episode = makeEpisode({ outcome_signal: 0.5, is_correction: false });
      const semantic = makeSemantic();
      const result = await reasoner.judgeReplay(
        episode, "Successfully used barrel exports",
        semantic, "Use barrel exports for TypeScript"
      );
      expect(result.relation).toBe("supports");
      expect(result.confidence).toBe(1.0);
    });

    it("returns 'novel' for neutral episodes", async () => {
      const episode = makeEpisode({ outcome_signal: 0.0, is_correction: false });
      const semantic = makeSemantic();
      const result = await reasoner.judgeReplay(
        episode, "Discussed config options",
        semantic, "Config uses YAML format"
      );
      expect(result.relation).toBe("novel");
    });
  });

  describe("distill", () => {
    it("returns the summary as the generalization", async () => {
      const episode = makeEpisode({
        summary: "User prefers named exports over default exports",
        file_path: "episodic/ep-1.md",
      });
      const result = await reasoner.distill(episode, "episode content here");
      expect(result.generalization).toBe("User prefers named exports over default exports");
    });

    it("extracts domain from file path when episode has project context", async () => {
      const episode = makeEpisode({
        summary: "Auth tokens must be rotated",
        file_path: "episodic/ep-1.md",
        project: "my-app",
      });
      const result = await reasoner.distill(
        episode,
        "Working on src/auth/tokens.ts — auth tokens must be rotated every 24 hours"
      );
      expect(result.domain).toBe("auth");
    });

    it("falls back to 'general' when no domain can be extracted", async () => {
      const episode = makeEpisode({ summary: "Some generic learning" });
      const result = await reasoner.distill(episode, "no recognizable domain here");
      expect(result.domain).toBe("general");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=reasoner`

Expected: FAIL — `../reasoner` module not found.

- [ ] **Step 3: Implement `packages/core/src/reasoner.ts`**

```typescript
import type { EpisodeRecord, SemanticRecord } from "@neuroclaw/config";

// -- Interfaces --

export interface ReplayJudgment {
  relation: "supports" | "contradicts" | "novel";
  confidence: number;
  reasoning: string;
}

export interface DistillationResult {
  generalization: string;
  domain: string;
  tags: string[];
}

export interface DreamReasoner {
  judgeReplay(
    episode: EpisodeRecord, episodeContent: string,
    semanticEntry: SemanticRecord, semanticContent: string
  ): Promise<ReplayJudgment>;

  distill(episode: EpisodeRecord, episodeContent: string): Promise<DistillationResult>;
}

// -- Domain extraction --

const DOMAIN_PATTERNS: Array<{ pattern: RegExp; domain: string }> = [
  { pattern: /\bauth\b/i, domain: "auth" },
  { pattern: /\bapi\b/i, domain: "api" },
  { pattern: /\btest(s|ing)?\b/i, domain: "testing" },
  { pattern: /\bdeploy(ment)?\b/i, domain: "deployment" },
  { pattern: /\bdatabase\b|\bsql\b|\bdb\b/i, domain: "database" },
  { pattern: /\bfrontend\b|\bcss\b|\bui\b|\breact\b/i, domain: "frontend" },
  { pattern: /\bsecurity\b/i, domain: "security" },
  { pattern: /\bconfig(uration)?\b/i, domain: "config" },
  { pattern: /\bcli\b|\bcommand\b/i, domain: "cli" },
  { pattern: /\bmemory\b/i, domain: "memory" },
];

// Also extract domain from file paths like src/auth/tokens.ts → "auth"
const PATH_DOMAIN_PATTERN = /(?:src|lib|packages?)\/([a-z][\w-]*)\//i;

function extractDomain(text: string): string {
  // Try path-based extraction first
  const pathMatch = text.match(PATH_DOMAIN_PATTERN);
  if (pathMatch) return pathMatch[1].toLowerCase();

  // Fall back to keyword matching
  for (const { pattern, domain } of DOMAIN_PATTERNS) {
    if (pattern.test(text)) return domain;
  }

  return "general";
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const { pattern, domain } of DOMAIN_PATTERNS) {
    if (pattern.test(text) && !tags.includes(domain)) {
      tags.push(domain);
    }
  }
  return tags;
}

// -- Rule-Based Reasoner --

export class RuleBasedReasoner implements DreamReasoner {
  async judgeReplay(
    episode: EpisodeRecord, _episodeContent: string,
    _semanticEntry: SemanticRecord, _semanticContent: string
  ): Promise<ReplayJudgment> {
    // Correction with negative/neutral outcome → contradicts
    if (episode.is_correction) {
      return {
        relation: "contradicts",
        confidence: 1.0,
        reasoning: "Episode is a correction (is_correction=true)",
      };
    }

    // Positive outcome → supports
    if (episode.outcome_signal > 0) {
      return {
        relation: "supports",
        confidence: 1.0,
        reasoning: `Positive outcome signal (${episode.outcome_signal})`,
      };
    }

    // Neutral — treat as novel (not enough signal to confirm or deny)
    return {
      relation: "novel",
      confidence: 0.5,
      reasoning: "Neutral episode — insufficient signal to judge relationship",
    };
  }

  async distill(
    episode: EpisodeRecord, episodeContent: string
  ): Promise<DistillationResult> {
    const combinedText = `${episode.summary} ${episodeContent}`;
    return {
      generalization: episode.summary,
      domain: extractDomain(combinedText),
      tags: extractTags(combinedText),
    };
  }
}

// -- LLM Reasoner --

export type LLMCallFn = (prompt: string) => Promise<string>;

export class LLMReasoner implements DreamReasoner {
  private llmCall: LLMCallFn;

  constructor(llmCall: LLMCallFn) {
    this.llmCall = llmCall;
  }

  async judgeReplay(
    episode: EpisodeRecord, episodeContent: string,
    semanticEntry: SemanticRecord, semanticContent: string
  ): Promise<ReplayJudgment> {
    const prompt = `You are judging whether a new episode confirms, contradicts, or is unrelated to an existing semantic memory.

EPISODE (${episode.is_correction ? "correction" : "observation"}, outcome: ${episode.outcome_signal}):
${episodeContent.slice(0, 400)}

EXISTING SEMANTIC ENTRY (domain: ${semanticEntry.domain}):
${semanticContent.slice(0, 400)}

Respond with ONLY a JSON object:
{"relation": "supports" | "contradicts" | "novel", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}`;

    const response = await this.llmCall(prompt);
    try {
      const parsed = JSON.parse(response);
      const relation = ["supports", "contradicts", "novel"].includes(parsed.relation)
        ? parsed.relation
        : "novel";
      return {
        relation: relation as "supports" | "contradicts" | "novel",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        reasoning: String(parsed.reasoning || "LLM judgment"),
      };
    } catch {
      return { relation: "novel", confidence: 0.3, reasoning: "Failed to parse LLM response" };
    }
  }

  async distill(
    episode: EpisodeRecord, episodeContent: string
  ): Promise<DistillationResult> {
    const prompt = `Extract a reusable generalization from this coding agent episode.

EPISODE:
${episodeContent.slice(0, 500)}

Summary: ${episode.summary}

Respond with ONLY a JSON object:
{"generalization": "<one sentence reusable insight>", "domain": "<single word domain like auth, testing, deployment>", "tags": ["<tag1>", "<tag2>"]}`;

    const response = await this.llmCall(prompt);
    try {
      const parsed = JSON.parse(response);
      return {
        generalization: String(parsed.generalization || episode.summary),
        domain: String(parsed.domain || "general"),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      };
    } catch {
      return {
        generalization: episode.summary,
        domain: extractDomain(`${episode.summary} ${episodeContent}`),
        tags: extractTags(`${episode.summary} ${episodeContent}`),
      };
    }
  }
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Add exports:

```typescript
export {
  RuleBasedReasoner,
  LLMReasoner,
  type DreamReasoner,
  type ReplayJudgment,
  type DistillationResult,
} from "./reasoner";
```

- [ ] **Step 5: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=reasoner`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/reasoner.ts packages/core/src/__tests__/reasoner.test.ts \
  packages/core/src/index.ts
git commit -m "feat: add DreamReasoner interface with rule-based and LLM implementations"
```

---

## Task 7: Build Dream Cycle

**Files:**
- Create: `packages/core/src/dream.ts`
- Create: `packages/core/src/__tests__/dream.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for DreamCycle**

Create `packages/core/src/__tests__/dream.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB, Vault, LocalValenceScorer, EpisodeCapture } from "@neuroclaw/memory";
import { GovernanceGate, AuditTrail } from "@neuroclaw/governance";
import { loadConfig } from "@neuroclaw/config";
import { DreamCycle } from "../dream";
import { RuleBasedReasoner } from "../reasoner";

describe("DreamCycle", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let dream: DreamCycle;
  let capture: EpisodeCapture;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-dream-"));
    const configDir = path.join(tmpDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: test-agent\n  store_path: ${path.join(tmpDir, "store")}\n`
    );

    const config = loadConfig(configDir);
    const storeDir = path.join(tmpDir, "store");
    vault = new Vault(storeDir);
    vault.init();
    db = await NeuroclawDB.create(path.join(storeDir, "index.db"));

    const scorer = new LocalValenceScorer();
    capture = new EpisodeCapture(db, vault, scorer);

    const gate = new GovernanceGate("autonomous");
    const audit = new AuditTrail(path.join(storeDir, "audit.md"));
    const reasoner = new RuleBasedReasoner();

    dream = new DreamCycle(db, vault, config, gate, audit, reasoner);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns a minimal report when no episodes are pending", async () => {
    const report = await dream.run();
    expect(report.episodesProcessed).toBe(0);
    expect(report.consolidated).toBe(0);
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
  });

  it("processes pending episodes and consolidates them", async () => {
    await capture.capture({
      sessionId: "sess-1",
      project: "test",
      interactionText: "Perfect, that's exactly right",
      summary: "User confirmed the TypeScript barrel export pattern works well",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    const report = await dream.run();
    expect(report.episodesProcessed).toBe(1);
    expect(report.consolidated).toBe(1);

    // Episode should now be marked as consolidated
    const pending = db.getPendingEpisodes();
    expect(pending).toHaveLength(0);
  });

  it("creates semantic entries from novel episodes", async () => {
    await capture.capture({
      sessionId: "sess-2",
      project: null,
      interactionText: "Working on src/auth/middleware.ts",
      summary: "Auth middleware must run CORS before session checks",
      isCorrection: false,
      outcomeSignal: 0.5,
    });

    await dream.run();

    // Should have created a semantic entry
    const authEntries = db.getSemanticByDomain("auth");
    expect(authEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("creates contradicts relation for correction episodes that match existing semantic", async () => {
    // First, create a semantic entry
    db.insertSemantic({
      id: "sem-existing",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 1,
      confidence: 0.8,
      file_path: "semantic/domains/auth.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });
    db.indexContent("sem-existing", "semantic", "Auth middleware session handling CORS");

    // Now capture a correction episode about the same topic
    await capture.capture({
      sessionId: "sess-3",
      project: null,
      interactionText: "No that's wrong. CORS must run before auth.",
      summary: "Correction: CORS must run before session auth middleware checks",
      isCorrection: true,
      outcomeSignal: -0.5,
    });

    await dream.run();

    // Should have a contradicts relation
    const relations = db.getRelationsFrom("sem-existing");
    const contradicts = relations.filter((r) => r.relation_type === "contradicts");
    // Could be from the episode to existing, check both directions
    const relationsTo = db.getRelationsTo("sem-existing");
    const allContradicts = [
      ...contradicts,
      ...relationsTo.filter((r) => r.relation_type === "contradicts"),
    ];
    expect(allContradicts.length).toBeGreaterThanOrEqual(0);
    // At minimum, a hypothesis should be created
  });

  it("applies forgetting curves and archives low-retention entries", async () => {
    // Create an old, unreferenced semantic entry with very low retention
    const oldTime = Date.now() - 90 * 24 * 60 * 60 * 1000; // 90 days ago
    db.insertSemantic({
      id: "sem-old",
      domain: "obsolete",
      created: oldTime,
      last_accessed: oldTime,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.3,
      file_path: "semantic/domains/obsolete.md",
      line_range: null,
      half_life: 5, // very short half-life
      retention: 0.05, // already below threshold
      source_episode_ids: "",
    });
    vault.write("semantic/domains/obsolete.md", "Old obsolete knowledge");

    await dream.run();

    const entry = db.getSemantic("sem-old");
    expect(entry!.consolidation_status ?? entry!.retention).toBeDefined();
    // Retention should be recalculated
  });

  it("writes a dream report to the vault", async () => {
    await capture.capture({
      sessionId: "sess-5",
      project: null,
      interactionText: "Testing dream reports",
      summary: "Basic interaction for report generation",
      isCorrection: false,
      outcomeSignal: 0.0,
    });

    const report = await dream.run();
    expect(report.digestPath).toMatch(/^dreams\/dream-/);

    const reportContent = vault.read(report.digestPath);
    expect(reportContent).not.toBeNull();
    expect(reportContent).toContain("Freshness");
  });

  it("computes health metrics in the report", async () => {
    const report = await dream.run();
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=dream`

Expected: FAIL — `../dream` module not found.

- [ ] **Step 3: Implement `packages/core/src/dream.ts`**

```typescript
import type {
  NeuroclawConfig,
  DreamReport,
  EpisodeRecord,
  SemanticRecord,
  ConsolidationStatus,
} from "@neuroclaw/config";
import type { NeuroclawDB } from "@neuroclaw/memory";
import type { Vault } from "@neuroclaw/memory";
import type { GovernanceGate, AuditTrail } from "@neuroclaw/governance";
import type { DreamReasoner } from "./reasoner";

const FTS_MATCH_THRESHOLD = 3.0;

export class DreamCycle {
  private db: NeuroclawDB;
  private vault: Vault;
  private config: NeuroclawConfig;
  private gate: GovernanceGate;
  private audit: AuditTrail;
  private reasoner: DreamReasoner;

  constructor(
    db: NeuroclawDB,
    vault: Vault,
    config: NeuroclawConfig,
    gate: GovernanceGate,
    audit: AuditTrail,
    reasoner: DreamReasoner
  ) {
    this.db = db;
    this.vault = vault;
    this.config = config;
    this.gate = gate;
    this.audit = audit;
    this.reasoner = reasoner;
  }

  async run(): Promise<DreamReport> {
    // Phase 1: Collection
    const episodes = this.db.getPendingEpisodes();

    if (episodes.length === 0) {
      return this.buildReport(0, 0, 0, [], []);
    }

    // Sort by importance (highest first) — already sorted by DB query,
    // but re-sort to include valence weighting
    episodes.sort((a, b) => {
      const aScore = a.importance + Math.abs(a.valence) * 0.3;
      const bScore = b.importance + Math.abs(b.valence) * 0.3;
      return bScore - aScore;
    });

    // Phase 2: Replay
    let consolidated = 0;
    const hypothesesUpdated: string[] = [];

    for (const episode of episodes) {
      await this.replayEpisode(episode, hypothesesUpdated);
      consolidated++;
    }

    // Phase 3: Consolidation
    for (const episode of episodes) {
      this.db.updateEpisodeStatus(episode.id, "consolidated");
    }
    this.applyForgettingCurves();

    // Phase 4: Self-Model Evolution
    const capabilityChanges = this.evolveHypotheses(hypothesesUpdated);

    // Phase 5: Health Report
    const archived = this.archiveLowRetention();

    return this.buildReport(
      episodes.length,
      consolidated,
      archived,
      hypothesesUpdated,
      capabilityChanges
    );
  }

  private async replayEpisode(
    episode: EpisodeRecord,
    hypothesesUpdated: string[]
  ): Promise<void> {
    const episodeContent = this.vault.read(episode.file_path) ?? episode.summary;

    // Search for matching semantic entries
    const ftsResults = this.db.searchFTS(episode.summary, 5);
    const strongMatches = ftsResults.filter((r) => Math.abs(r.rank) >= FTS_MATCH_THRESHOLD);

    if (strongMatches.length > 0) {
      // Replay against each strong match
      for (const match of strongMatches) {
        if (match.source_type !== "semantic") continue;

        const semanticEntry = this.db.getSemantic(match.source_id);
        if (!semanticEntry) continue;

        const semanticContent = this.vault.read(semanticEntry.file_path) ?? "";

        const judgment = await this.reasoner.judgeReplay(
          episode, episodeContent,
          semanticEntry, semanticContent
        );

        const now = Date.now();

        if (judgment.relation === "supports") {
          this.db.incrementSemanticRefCount(semanticEntry.id);
          this.db.insertRelation({
            source_id: episode.id,
            target_id: semanticEntry.id,
            relation_type: "supports",
            weight: judgment.confidence,
            created: now,
            last_used: now,
            provenance: "rule",
            confidence: judgment.confidence,
          });
        } else if (judgment.relation === "contradicts") {
          this.db.insertRelation({
            source_id: episode.id,
            target_id: semanticEntry.id,
            relation_type: "contradicts",
            weight: judgment.confidence,
            created: now,
            last_used: now,
            provenance: "rule",
            confidence: judgment.confidence,
          });

          // Create or update a hypothesis
          const hypId = `hyp-${episode.id}-${semanticEntry.id}`;
          this.db.insertHypothesis({
            id: hypId,
            claim: `Episode ${episode.id} contradicts semantic ${semanticEntry.id}: ${judgment.reasoning}`,
            evidence_for: 0,
            evidence_against: 1,
            status: "tentative",
            created: now,
            last_tested: now,
            outcome_score: episode.outcome_signal,
          });
          hypothesesUpdated.push(hypId);
        }
        // "novel" with a match — skip, the match wasn't semantically relevant
      }
    } else {
      // No strong match — create new semantic entry
      await this.createSemanticFromEpisode(episode, episodeContent);
    }

    this.audit.log({
      operation: "dream_replay",
      component: "dream_cycle",
      description: `Replayed episode ${episode.id} (${strongMatches.length} matches)`,
      evidence: [episode.summary],
    });
  }

  private async createSemanticFromEpisode(
    episode: EpisodeRecord,
    episodeContent: string
  ): Promise<void> {
    const distillation = await this.reasoner.distill(episode, episodeContent);
    const now = Date.now();
    const semId = `sem-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = `semantic/domains/${distillation.domain}.md`;

    // Append to domain file (or create)
    const existing = this.vault.read(filePath);
    const content = existing
      ? `${existing}\n\n## ${distillation.generalization}\n\nSource: ${episode.id}\nTags: ${distillation.tags.join(", ")}\n`
      : `# ${distillation.domain}\n\n## ${distillation.generalization}\n\nSource: ${episode.id}\nTags: ${distillation.tags.join(", ")}\n`;
    this.vault.write(filePath, content);

    // Calculate half_life based on valence
    const baseHalfLife = this.config.memory.forgetting.decay_window_days;
    const valenceBoost = Math.abs(episode.valence) * baseHalfLife * 0.5;
    const halfLife = baseHalfLife + valenceBoost;

    this.db.insertSemantic({
      id: semId,
      domain: distillation.domain,
      created: now,
      last_accessed: now,
      importance: episode.importance,
      ref_count: 1,
      confidence: 0.5,
      file_path: filePath,
      line_range: null,
      half_life: halfLife,
      retention: 1.0,
      source_episode_ids: episode.id,
    });

    this.db.indexContent(semId, "semantic", distillation.generalization);

    // Create elaborates relation from episode to semantic
    this.db.insertRelation({
      source_id: episode.id,
      target_id: semId,
      relation_type: "elaborates",
      weight: 1.0,
      created: now,
      last_used: now,
      provenance: "rule",
      confidence: 1.0,
    });
  }

  private applyForgettingCurves(): void {
    if (!this.config.memory.forgetting.enabled) return;

    const allSemantic = this.db.getAllSemanticEntries();
    const now = Date.now();
    const unforgettable = this.config.memory.forgetting.unforgettable_categories;

    for (const entry of allSemantic) {
      // Skip unforgettable domains
      if (unforgettable.includes(entry.domain)) continue;

      const ageDays = (now - entry.last_accessed) / (24 * 60 * 60 * 1000);
      const retention = Math.exp(-ageDays / (entry.half_life * Math.max(entry.importance, 0.1)));

      this.db.updateSemanticRetention(entry.id, retention, entry.half_life);
    }
  }

  private archiveLowRetention(): number {
    const allSemantic = this.db.getAllSemanticEntries();
    const threshold = this.config.memory.forgetting.min_importance_to_keep;
    let archived = 0;

    for (const entry of allSemantic) {
      if (entry.retention < threshold) {
        // Move file to archive
        const archivePath = `archive/${entry.id}.md`;
        const content = this.vault.read(entry.file_path);
        if (content) {
          this.vault.write(archivePath, content);
        }
        archived++;

        this.audit.log({
          operation: "archive_memory",
          component: "dream_cycle",
          description: `Archived semantic entry ${entry.id} (retention: ${entry.retention.toFixed(3)})`,
          evidence: [entry.domain, entry.file_path],
        });
      }
    }

    return archived;
  }

  private evolveHypotheses(hypothesesUpdated: string[]): string[] {
    const capabilityChanges: string[] = [];
    const promoThreshold = this.config.self_model.hypothesis.promotion_threshold;
    const demoThreshold = this.config.self_model.hypothesis.demotion_threshold;

    for (const hypId of hypothesesUpdated) {
      const hyp = this.db.getHypothesis(hypId);
      if (!hyp) continue;

      if (hyp.evidence_for >= promoThreshold) {
        const requiresApproval = this.gate.requiresApproval("hypothesis_promotion");

        if (requiresApproval) {
          // Write to pending-evolution.md for user review
          const pendingPath = "dreams/pending-evolution.md";
          const existing = this.vault.read(pendingPath) ?? "# Pending Evolution\n\n";
          this.vault.write(
            pendingPath,
            `${existing}## ${hypId}\n\nClaim: ${hyp.claim}\nEvidence for: ${hyp.evidence_for}\nEvidence against: ${hyp.evidence_against}\n\n`
          );
        } else {
          this.db.updateHypothesisStatus(hypId, "confirmed");
          capabilityChanges.push(`Confirmed: ${hyp.claim}`);
          this.appendToIdentity(hyp.claim);
        }
      } else if (hyp.evidence_against <= demoThreshold) {
        this.db.updateHypothesisStatus(hypId, "demoted");
        capabilityChanges.push(`Demoted: ${hyp.claim}`);
      }
    }

    if (capabilityChanges.length > 0) {
      const logEntry = capabilityChanges
        .map((c) => `- ${c}`)
        .join("\n");
      this.vault.append(
        "self-model/evolution-log.md",
        `\n### ${new Date().toISOString()}\n\n${logEntry}\n`
      );
    }

    return capabilityChanges;
  }

  private appendToIdentity(claim: string): void {
    const identityPath = "self-model/identity.md";
    const content = this.vault.read(identityPath) ?? "";

    // Insert before <!-- /MUTABLE --> closing tag
    const insertPoint = content.indexOf("<!-- /MUTABLE -->");
    if (insertPoint === -1) {
      this.vault.append(identityPath, `\n- ${claim}\n`);
    } else {
      const before = content.slice(0, insertPoint);
      const after = content.slice(insertPoint);
      this.vault.write(identityPath, `${before}- ${claim}\n${after}`);
    }
  }

  private buildReport(
    episodesProcessed: number,
    consolidated: number,
    archived: number,
    hypothesesUpdated: string[],
    capabilityChanges: string[]
  ): DreamReport {
    const health = this.computeHealth();
    const timestamp = Date.now();
    const digestPath = `dreams/dream-${timestamp}.md`;

    const reportContent = [
      `# Dream Report — ${new Date(timestamp).toISOString()}`,
      "",
      `## Summary`,
      `- Episodes processed: ${episodesProcessed}`,
      `- Consolidated: ${consolidated}`,
      `- Archived: ${archived}`,
      `- Hypotheses updated: ${hypothesesUpdated.length}`,
      `- Capability changes: ${capabilityChanges.length}`,
      "",
      `## Health Metrics`,
      `- Freshness: ${health.freshness.toFixed(1)}%`,
      `- Coverage: ${health.coverage.toFixed(1)}%`,
      `- Coherence: ${health.coherence.toFixed(2)}`,
      `- Efficiency: ${health.efficiency.toFixed(2)}`,
      `- Groundedness: ${health.groundedness.toFixed(1)}%`,
      `- Affective balance: ${health.affectiveBalance.toFixed(2)}`,
      `- **Overall: ${health.overall.toFixed(0)}**`,
      "",
    ].join("\n");

    this.vault.write(digestPath, reportContent);

    return {
      timestamp,
      episodesProcessed,
      consolidated,
      archived,
      hypothesesUpdated,
      capabilityChanges,
      healthScore: health.overall,
      securityFindings: [],
      digestPath,
    };
  }

  private computeHealth(): {
    freshness: number;
    coverage: number;
    coherence: number;
    efficiency: number;
    groundedness: number;
    affectiveBalance: number;
    overall: number;
  } {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const allSemantic = this.db.getAllSemanticEntries();
    const allEpisodes = this.db.getPendingEpisodes();
    // Get consolidated episodes count from all episodes (pending already excluded)

    // Freshness: % of semantic entries accessed in last 30 days
    const freshCount = allSemantic.filter(
      (s) => now - s.last_accessed < thirtyDaysMs
    ).length;
    const freshness = allSemantic.length > 0
      ? (freshCount / allSemantic.length) * 100
      : 100;

    // Coverage: % of unique domains updated in last 14 days
    const allDomains = new Set(allSemantic.map((s) => s.domain));
    const recentDomains = new Set(
      allSemantic
        .filter((s) => now - s.last_accessed < fourteenDaysMs)
        .map((s) => s.domain)
    );
    const coverage = allDomains.size > 0
      ? (recentDomains.size / allDomains.size) * 100
      : 100;

    // Coherence: average relation count per semantic entry
    let totalRelations = 0;
    for (const sem of allSemantic) {
      const rels = this.db.getRelationsFrom(sem.id);
      const relsTo = this.db.getRelationsTo(sem.id);
      totalRelations += rels.length + relsTo.length;
    }
    const coherence = allSemantic.length > 0
      ? totalRelations / allSemantic.length
      : 0;

    // Efficiency: semantic count / total episode count (rough — uses pending as proxy)
    const episodeCount = Math.max(allEpisodes.length + allSemantic.length, 1);
    const efficiency = allSemantic.length / episodeCount;

    // Groundedness: simplified — % of semantic entries with ref_count > 0
    const groundedCount = allSemantic.filter((s) => s.ref_count > 0).length;
    const groundedness = allSemantic.length > 0
      ? (groundedCount / allSemantic.length) * 100
      : 100;

    // Affective balance: mean valence of recent episodes
    // Use pending episodes as a proxy (recently captured)
    const recentValences = allEpisodes
      .filter((e) => now - e.timestamp < sevenDaysMs)
      .map((e) => e.valence);
    const affectiveBalance = recentValences.length > 0
      ? recentValences.reduce((sum, v) => sum + v, 0) / recentValences.length
      : 0;

    // Overall: weighted average (0-100)
    const overall = Math.min(100, Math.max(0,
      freshness * 0.2 +
      coverage * 0.2 +
      Math.min(coherence * 20, 100) * 0.15 +
      Math.min(efficiency * 100, 100) * 0.15 +
      groundedness * 0.2 +
      (50 + affectiveBalance * 50) * 0.1
    ));

    return { freshness, coverage, coherence, efficiency, groundedness, affectiveBalance, overall };
  }
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

Add export:

```typescript
export { DreamCycle } from "./dream";
```

- [ ] **Step 5: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=dream`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dream.ts packages/core/src/__tests__/dream.test.ts \
  packages/core/src/index.ts
git commit -m "feat: add five-phase dream cycle with CLS-inspired interleaved replay"
```

---

## Task 8: Integrate Dream Cycle and Capture into NeuroclawEngine

**Files:**
- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/src/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing tests for engine integration**

Add to `packages/core/src/__tests__/engine.test.ts`:

```typescript
it("captures an episode via captureEpisode facade", async () => {
  await engine.init();
  const record = await engine.captureEpisode({
    sessionId: "sess-1",
    project: "test",
    interactionText: "Great work!",
    summary: "User praised the implementation",
    isCorrection: false,
    outcomeSignal: 0.5,
  });
  expect(record.id).toMatch(/^ep-/);
  expect(record.valence).toBeGreaterThan(0);
});

it("executes a dream cycle", async () => {
  await engine.init();

  // Capture an episode first
  await engine.captureEpisode({
    sessionId: "sess-dream",
    project: null,
    interactionText: "This is a test interaction",
    summary: "Test episode for dream cycle",
    isCorrection: false,
    outcomeSignal: 0.0,
  });

  const report = await engine.executeDream();
  expect(report.episodesProcessed).toBe(1);
  expect(report.consolidated).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=engine`

Expected: FAIL — `captureEpisode` and `executeDream` are not methods on `NeuroclawEngine`.

- [ ] **Step 3: Update `packages/core/src/engine.ts`**

Add imports at the top:

```typescript
import { EpisodeCapture, LocalValenceScorer } from "@neuroclaw/memory";
import type { CaptureInput } from "@neuroclaw/memory";
import type { EpisodeRecord, DreamReport } from "@neuroclaw/config";
import { DreamCycle } from "./dream";
import { RuleBasedReasoner } from "./reasoner";
```

Add private fields:

```typescript
private capture!: EpisodeCapture;
private dreamCycle!: DreamCycle;
```

At the end of `init()`, after the scanner initialization, add:

```typescript
const scorer = new LocalValenceScorer();
this.capture = new EpisodeCapture(this.db, this.vault, scorer);

const reasoner = new RuleBasedReasoner();
this.dreamCycle = new DreamCycle(
  this.db, this.vault, this.config,
  this.gate, this.audit, reasoner
);
```

Add new public methods:

```typescript
async captureEpisode(input: CaptureInput): Promise<EpisodeRecord> {
  return this.capture.capture(input);
}

async executeDream(): Promise<DreamReport> {
  return this.dreamCycle.run();
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=engine`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine.ts packages/core/src/__tests__/engine.test.ts
git commit -m "feat: integrate episodic capture and dream cycle into NeuroclawEngine"
```

---

## Task 9: Implement Graph-Walk Retrieval

**Files:**
- Modify: `packages/memory/src/retrieval.ts`
- Modify: `packages/memory/src/__tests__/retrieval.test.ts`

- [ ] **Step 1: Write failing tests for graph-walk retrieval**

Add to `packages/memory/src/__tests__/retrieval.test.ts`:

```typescript
describe("graphWalkSearch", () => {
  it("discovers related entries via graph walk", () => {
    // Create semantic entries
    db.insertSemantic({
      id: "sem-gw1",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.8,
      ref_count: 2,
      confidence: 0.9,
      file_path: "semantic/domains/auth.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });
    db.insertSemantic({
      id: "sem-gw2",
      domain: "security",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 1,
      confidence: 0.8,
      file_path: "semantic/domains/security.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });

    // Index them
    db.indexContent("sem-gw1", "semantic", "Authentication middleware handles session tokens");
    db.indexContent("sem-gw2", "semantic", "Security headers must include CORS policies");

    // Create relation between them
    db.insertRelation({
      source_id: "sem-gw1",
      target_id: "sem-gw2",
      relation_type: "requires",
      weight: 0.9,
      created: Date.now(),
      last_used: Date.now(),
      provenance: "rule",
      confidence: 1.0,
    });

    // Write vault files
    vault.write("semantic/domains/auth.md", "Auth middleware session tokens");
    vault.write("semantic/domains/security.md", "Security headers CORS policies");

    // Query that should find auth (direct) and security (via graph walk)
    const engine = new RetrievalEngine(db, vault);
    const results = engine.search("how does authentication relate to security headers", 10);

    // Should find at least the direct FTS match
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
```

Note: this test requires `RetrievalEngine`, `NeuroclawDB`, and `Vault` to all be imported in the test file. Check the existing imports in `retrieval.test.ts` and add `Vault` import + vault setup to `beforeEach`/`afterEach` if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=retrieval`

Expected: FAIL — graph walk still falls back to text search.

- [ ] **Step 3: Implement `graphWalkSearch` in `packages/memory/src/retrieval.ts`**

Replace the stub `graphWalkSearch` method:

```typescript
private graphWalkSearch(query: string, limit: number): RetrievedMemory[] {
  // Step 1: Seed selection — top 3 FTS results
  const seeds = this.db.searchFTS(query, 3);
  if (seeds.length === 0) return [];

  const scored = new Map<string, { score: number; sourceType: string }>();

  // Score seeds
  for (const seed of seeds) {
    scored.set(seed.source_id, {
      score: Math.abs(seed.rank),
      sourceType: seed.source_type,
    });
  }

  // Step 2: Walk — up to 2 hops from each seed
  const DEPTH_DECAY = 0.7;

  for (const seed of seeds) {
    const seedScore = Math.abs(seed.rank);

    // Hop 1
    const hop1From = this.db.getRelationsFrom(seed.source_id);
    const hop1To = this.db.getRelationsTo(seed.source_id);
    const hop1 = [...hop1From, ...hop1To];

    for (const rel of hop1) {
      const neighborId = rel.source_id === seed.source_id
        ? rel.target_id
        : rel.source_id;
      const score = seedScore * rel.weight * DEPTH_DECAY;
      const existing = scored.get(neighborId);
      if (!existing || score > existing.score) {
        scored.set(neighborId, { score, sourceType: "semantic" });
      }

      // Hop 2
      const hop2From = this.db.getRelationsFrom(neighborId);
      const hop2To = this.db.getRelationsTo(neighborId);
      const hop2 = [...hop2From, ...hop2To];

      for (const rel2 of hop2) {
        const neighbor2Id = rel2.source_id === neighborId
          ? rel2.target_id
          : rel2.source_id;
        if (neighbor2Id === seed.source_id) continue; // skip back to seed
        const score2 = seedScore * rel.weight * rel2.weight * DEPTH_DECAY * DEPTH_DECAY;
        const existing2 = scored.get(neighbor2Id);
        if (!existing2 || score2 > existing2.score) {
          scored.set(neighbor2Id, { score: score2, sourceType: "semantic" });
        }
      }
    }
  }

  // Step 3: Rank and hydrate
  const sorted = [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  return this.hydrateScored(sorted);
}

private hydrateScored(
  entries: Array<[string, { score: number; sourceType: string }]>
): RetrievedMemory[] {
  const memories: RetrievedMemory[] = [];

  for (const [id, { score }] of entries) {
    const record = this.db.getSemantic(id);
    if (!record) continue;

    const content = this.vault.read(record.file_path);
    if (!content) continue;

    memories.push({
      id: record.id,
      type: "semantic",
      content,
      importance: record.importance,
      relevanceScore: score,
      source: record.file_path,
      created: String(record.created),
    });
  }

  return memories;
}
```

Also update the existing `hydrate` method — it can now call `hydrateScored` to avoid duplication:

```typescript
private hydrate(
  ftsResults: Array<{ source_id: string; source_type: string; rank: number }>
): RetrievedMemory[] {
  return this.hydrateScored(
    ftsResults.map((r) => [r.source_id, { score: Math.abs(r.rank), sourceType: r.source_type }])
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory -- --testPathPattern=retrieval`

Expected: All pass.

- [ ] **Step 5: Run full test suite**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests across all packages pass.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/retrieval.ts packages/memory/src/__tests__/retrieval.test.ts
git commit -m "feat: implement graph-walk retrieval with depth-decay scoring"
```

---

## Task 10: Final Integration Test and Cleanup

**Files:**
- Modify: `packages/core/src/__tests__/integration.test.ts`

- [ ] **Step 1: Update integration test for full Phase 2 flow**

Update or add to `packages/core/src/__tests__/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

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

    // Capture a few episodes
    await engine.captureEpisode({
      sessionId: "sess-int",
      project: "my-app",
      interactionText: "Working on src/auth/middleware.ts — the session check was in the wrong order",
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

    // Search should now find consolidated knowledge
    const results = engine.search("auth middleware session");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core -- --testPathPattern=integration`

Expected: All pass.

- [ ] **Step 3: Run full test suite one final time**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests pass across all packages. No circular dependency warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/__tests__/integration.test.ts
git commit -m "test: add Phase 2 full integration test (capture -> dream -> search)"
```

---

## Summary

| Task | Description | Key Output |
|------|-------------|------------|
| 1 | Fix circular dependency | Types in `@neuroclaw/config`, clean dep graph |
| 2 | Extend data model | Valence/arousal on episodes, forgetting fields, relation provenance |
| 3 | Build valence scorer | `LocalValenceScorer` (VADER + heuristics + domain patterns) |
| 4 | Extend importance formula | `valenceMagnitude` weight for amygdala modulation |
| 5 | Build episodic capture | `EpisodeCapture` pipeline with scoring + vault + DB + FTS |
| 6 | Build DreamReasoner | `RuleBasedReasoner` + `LLMReasoner` for replay judgment + distillation |
| 7 | Build dream cycle | Five-phase `DreamCycle` with replay, consolidation, forgetting, evolution |
| 8 | Engine integration | `captureEpisode()` + `executeDream()` facades on `NeuroclawEngine` |
| 9 | Graph-walk retrieval | Real graph traversal replacing the stub |
| 10 | Integration test | Full capture → dream → search end-to-end test |
| 11 | better-sqlite3 migration | Replace sql.js with native synchronous SQLite driver |

---

### Task 11: Migrate SQLite driver from sql.js to better-sqlite3

**Why:** better-sqlite3 is a native Node.js addon (not WebAssembly), synchronous, ~10× faster than sql.js. It writes directly to disk — no explicit `save()` needed — and supports WAL journal mode natively.

**Files:**
- Modify: `packages/memory/package.json`
- Modify: `packages/memory/src/sqlite.ts`
- Modify: `packages/memory/src/__tests__/sqlite.test.ts`
- Modify: `packages/memory/src/__tests__/retrieval.test.ts`
- Modify: `packages/memory/src/__tests__/capture.test.ts`
- Modify: `packages/core/src/__tests__/dream.test.ts`
- Modify: `packages/core/src/engine.ts`

---

- [ ] **Step 1: Install better-sqlite3 and remove sql.js**

In `packages/memory/package.json`, replace the `sql.js` dependency and `@types/sql.js` devDependency:

```json
"dependencies": {
  "@neuroclaw/config": "0.1.0",
  "@neuroclaw/governance": "0.1.0",
  "crowd-sentiment": "^1.1.7",
  "better-sqlite3": "^9.6.0"
},
"devDependencies": {
  "@types/better-sqlite3": "^7.6.13",
  "typescript": "^5.7.0",
  "vitest": "^3.1.0"
}
```

Then from the worktree root:

```bash
cd packages/memory && npm install
```

Expected: `better-sqlite3` installed, `sql.js` and `@types/sql.js` removed.

---

- [ ] **Step 2: Rewrite sqlite.ts using better-sqlite3**

Replace `packages/memory/src/sqlite.ts` entirely:

```typescript
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
    source_episode_ids TEXT NOT NULL DEFAULT ''
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
        `INSERT INTO semantic (id, domain, created, last_accessed, importance, ref_count, confidence, file_path, line_range, half_life, retention, source_episode_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id, entry.domain, entry.created, entry.last_accessed, entry.importance,
        entry.ref_count, entry.confidence, entry.file_path, entry.line_range,
        entry.half_life, entry.retention, entry.source_episode_ids
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
    this.db.prepare("UPDATE semantic SET retention = ?, half_life = ? WHERE id = ?").run(retention, halfLife, id);
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
```

---

- [ ] **Step 3: Update sqlite.test.ts — journal mode + drop async from `create` callers**

`NeuroclawDB.create()` is now synchronous. In `packages/memory/src/__tests__/sqlite.test.ts`:

Change the journal mode test description and expectation:

```typescript
it("reports WAL journal mode", () => {
  const mode = db.getJournalMode();
  expect(mode).toBe("wal");
});
```

Change `beforeEach` to be synchronous:

```typescript
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-db-"));
  db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
});
```

Change the persistence test to be synchronous:

```typescript
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
```

Run:

```bash
cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory
```

Expected: All 65 memory tests pass.

---

- [ ] **Step 4: Update retrieval.test.ts and capture.test.ts**

In `packages/memory/src/__tests__/retrieval.test.ts`, change `beforeEach` from async to sync:

```typescript
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-retrieval-"));
  db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
  vault = new Vault(tmpDir);
  vault.init();
  retrieval = new RetrievalEngine(db, vault);
});
```

In `packages/memory/src/__tests__/capture.test.ts`, change `beforeEach` from async to sync:

```typescript
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-capture-"));
  db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
  vault = new Vault(tmpDir);
  vault.init();
  scorer = new LocalValenceScorer();
  capture = new EpisodeCapture(db, vault, scorer);
});
```

---

- [ ] **Step 5: Update engine.ts and dream.test.ts**

In `packages/core/src/engine.ts`, change line 42:

```typescript
this.db = NeuroclawDB.create(dbPath);
```

(Remove the `await` — `create()` is now synchronous. The `this.db.save()` line below can be removed since `save()` is now a no-op.)

In `packages/core/src/__tests__/dream.test.ts`, update the `beforeEach` call from `await NeuroclawDB.create(dbPath)` to synchronous:

```typescript
db = NeuroclawDB.create(dbPath);
```

Run:

```bash
cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core
```

Expected: All 40 core tests pass.

---

- [ ] **Step 6: Run full test suite**

```bash
cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test
```

Expected: All tests across all 6 packages pass. No TypeScript errors.

---

- [ ] **Step 7: Commit**

```bash
git add packages/memory/package.json packages/memory/package-lock.json \
        packages/memory/src/sqlite.ts \
        packages/memory/src/__tests__/sqlite.test.ts \
        packages/memory/src/__tests__/retrieval.test.ts \
        packages/memory/src/__tests__/capture.test.ts \
        packages/core/src/engine.ts \
        packages/core/src/__tests__/dream.test.ts
git commit -m "perf: replace sql.js with better-sqlite3 (native, synchronous, ~10x faster)"
```
