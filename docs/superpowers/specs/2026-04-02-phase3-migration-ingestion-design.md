# Phase 3: Migration, Ingestion, GSEM & Forgetting — Design Spec

## Goal

Bring existing OpenClaw memory content into NeuroClaw, provide a general-purpose markdown ingestion CLI, refine the knowledge graph through retrieval feedback, surface source citations on retrieved memories, and protect valuable memories with a three-tier forgetting safety net.

## Architecture

Three layers built on the shared `Ingester` pipeline:

**Layer 1 — Ingestion pipeline** (`packages/memory`)
- `Ingester`: shared core — splits content, writes vault files, inserts DB, indexes FTS. Platform-agnostic.
- `Migrator`: wraps `Ingester` with OpenClaw-specific file detection and classification.

**Layer 2 — Retrieval enhancements** (`packages/memory`)
- GSEM: edge weights in the `relations` table incremented on graph-walk traversal, decayed during dream cycle.
- Source citations: `RetrievedMemory` extended with `sourceFile`, `domain`, `createdAt`, `citationLabel`.

**Layer 3 — Forgetting safety nets** (`packages/core`)
- Three-tier protection extending the dream cycle's existing forgetting phase.

**CLI** (`packages/core`)
- `neuroclaw migrate` and `neuroclaw ingest` subcommands via engine facades.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/memory/src/ingester.ts` | `Ingester` class — parse, split, classify, write vault, index DB |
| `packages/memory/src/migrator.ts` | `Migrator` class — OpenClaw file detection + classification |
| `packages/memory/src/__tests__/ingester.test.ts` | Tests for `Ingester` |
| `packages/memory/src/__tests__/migrator.test.ts` | Tests for `Migrator` |

### Modified Files

| File | Change |
|------|--------|
| `packages/config/src/types.ts` | Extend `RetrievedMemory` with citation fields; extend `SemanticRecord` with `tags` |
| `packages/config/src/schema.ts` | Add `forgetting.merge_before_drop` and `forgetting.unforgettable_categories` |
| `packages/config/src/defaults.ts` | Forgetting defaults |
| `packages/memory/src/sqlite.ts` | Add `tags` column to `semantic` table; add `incrementEdgeWeight()` method |
| `packages/memory/src/retrieval.ts` | GSEM edge updates on graph-walk; populate citation fields on hydration |
| `packages/memory/src/index.ts` | Export `Ingester`, `Migrator` |
| `packages/core/src/dream.ts` | 3-tier forgetting safety nets |
| `packages/core/src/engine.ts` | `migrateFromOpenClaw()` and `ingestFile()` facades |
| `packages/core/src/cli.ts` | Add `migrate` and `ingest` subcommands |
| `packages/core/src/__tests__/dream.test.ts` | New forgetting safety net tests |

---

## Section 1: Data Model Extensions

### `SemanticRecord` — add `tags`

New field: `tags: string` (comma-separated, e.g. `"migration,source:MEMORY.md"`). Stored as a TEXT column on the `semantic` table. Used by Tier 3 forgetting to identify migration-sourced entries.

```typescript
// packages/config/src/types.ts
export interface SemanticRecord {
  // ... existing fields ...
  tags: string;  // comma-separated, empty string if none
}
```

Schema addition:
```sql
ALTER TABLE semantic ADD COLUMN tags TEXT NOT NULL DEFAULT '';
```

Since `NeuroclawDB.create()` uses `CREATE TABLE IF NOT EXISTS`, new columns on existing databases require an explicit migration check on open:

```typescript
// In NeuroclawDB.create(), after db.exec(SCHEMA):
const cols = db.pragma("table_info(semantic)") as Array<{ name: string }>;
if (!cols.some((c) => c.name === "tags")) {
  db.exec("ALTER TABLE semantic ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
}
```

### `RetrievedMemory` — add citation fields

```typescript
// packages/config/src/types.ts
export interface RetrievedMemory {
  id: string;
  type: MemoryType;
  content: string;
  score: number;
  filePath: string;
  // Citation fields (populated from DB on retrieval):
  sourceFile?: string;    // original file: "MEMORY.md", "memory/2026-03-01.md"
  domain?: string;        // "coding-preferences", "identity", etc.
  createdAt?: number;     // ms timestamp
  citationLabel?: string; // "MEMORY.md · coding-preferences · 3d ago"
}
```

### Forgetting config

```typescript
// packages/config/src/schema.ts — add to ForgettingSchema
merge_before_drop: z.boolean().default(true),
unforgettable_categories: z.array(z.string()).default([
  "identity",
  "user-profile",
  "corrections",
  "procedural",
]),
```

Default config (`defaults.ts`):
```typescript
forgetting: {
  enabled: true,
  decay_window_days: 30,
  min_importance_to_keep: 0.2,
  merge_before_drop: true,
  unforgettable_categories: ["identity", "user-profile", "corrections", "procedural"],
}
```

---

## Section 2: Ingester

### Interface

```typescript
// packages/memory/src/ingester.ts

export interface IngestInput {
  filePath: string;    // original source file path (for citation)
  content: string;     // raw markdown content
  type?: MemoryType;   // override classification
  domain?: string;     // override domain tag
  dryRun?: boolean;    // preview without writing
  tags?: string;       // comma-separated tags e.g. "migration,source:MEMORY.md"
}

export interface IngestedEntry {
  id: string;
  type: MemoryType;
  domain: string;
  vaultPath: string;   // path written in vault
  sourceFile: string;  // original file path
  content: string;
  importance: number;
}

export interface IngestResult {
  entries: IngestedEntry[];
  dryRun: boolean;
}

export class Ingester {
  constructor(db: NeuroclawDB, vault: Vault)
  async ingest(input: IngestInput): Promise<IngestResult>
}
```

### Splitting rules

1. **With H2 headings** (`## `): split on each H2 boundary → one entry per section. Domain derived from heading: `"## Coding Preferences"` → `"coding-preferences"` (lowercase, spaces to hyphens, strip special chars).
2. **No H2 headings**: split on blank-line-separated paragraphs. Paragraphs under 50 characters are merged with the following paragraph.
3. **Single-entry files** (SOUL.md, USER.md): no splitting, one entry for the whole file.
4. **`domain` override** takes precedence over derived domain.
5. **`type` override** takes precedence over default `"semantic"`.

### Importance

Base importance: `0.6` for migration-tagged entries (curated content), `0.5` for general ingestion. Passed to `computeImportance()` as `outcomeSignal: 0, isCorrection: false, valenceMagnitude: 0`.

### Vault path

Semantic entries written to: `vault/semantic/domains/<domain>/<id>.md`
Episodic entries written to: `vault/episodic/<YYYY-MM-DD>/<id>.md`

Frontmatter written to each vault file:
```markdown
---
id: sem-<timestamp>-<random6>
source: <sourceFile>
domain: <domain>
tags: <tags>
imported: <ISO date>
---

<content>
```

---

## Section 3: Migrator

### Interface

```typescript
// packages/memory/src/migrator.ts

export interface MigrationManifest {
  workDir: string;
  files: Array<{
    path: string;
    fileType: 'memory' | 'daily';
    exists: boolean;
  }>;
}

export interface MigrationReport {
  workDir: string;
  scanned: number;
  imported: number;
  skipped: number;
  entries: IngestedEntry[];
  dryRun: boolean;
}

export class Migrator {
  constructor(ingester: Ingester)
  scan(workDir: string): MigrationManifest
  async run(manifest: MigrationManifest, options?: { dryRun?: boolean }): Promise<MigrationReport>
}
```

### OpenClaw file classification

| File | `type` | `domain` | `tags` | Split |
|------|--------|----------|--------|-------|
| `MEMORY.md` | `semantic` | derived from H2 / `"general"` | `"migration,source:MEMORY.md"` | By H2 |
| `memory/YYYY-MM-DD.md` | `episodic` | `"daily-memory"` | `"migration,source:daily"` | Whole file |

**SOUL.md, USER.md, AGENTS.md are not migrated** — these are operational files managed by the Phase 5 adapter.

### Scan logic

`scan(workDir)` checks:
1. `<workDir>/MEMORY.md` → `fileType: 'memory'`
2. All files matching `<workDir>/memory/YYYY-MM-DD.md` (regex `^\d{4}-\d{2}-\d{2}\.md$`) → `fileType: 'daily'`

Returns manifest with `exists: false` for missing files (not an error — just skipped during `run()`).

Source files are **never modified or deleted**.

---

## Section 4: GSEM (Graph Edge Refinement)

### Edge weight increment on retrieval

In `RetrievalEngine.graphWalkSearch()`, after each successful hop traversal, call:

```typescript
db.incrementEdgeWeight(sourceId, targetId, relationType);
```

New `NeuroclawDB` method:
```typescript
incrementEdgeWeight(sourceId: string, targetId: string, relationType: string): void {
  this.db
    .prepare(`UPDATE relations
              SET weight = min(weight + 0.05, 2.0), last_used = ?
              WHERE source_id = ? AND target_id = ? AND relation_type = ?`)
    .run(Date.now(), sourceId, targetId, relationType);
}
```

Weight bounds: `[0.1, 2.0]`. Minimum 0.1 ensures edges never disappear from the graph, just lose influence.

### Edge weight decay during dream cycle

In the DreamCycle forgetting phase, after semantic retention decay, apply edge decay:

```typescript
const staleEdges = db.getStaleEdges(config.memory.forgetting.decay_window_days);
for (const edge of staleEdges) {
  const newWeight = Math.max(edge.weight * 0.9, 0.1);
  db.updateEdgeWeight(edge.source_id, edge.target_id, edge.relation_type, newWeight);
}
```

New `NeuroclawDB` methods:
```typescript
getStaleEdges(windowDays: number): RelationRecord[]
// SELECT * FROM relations WHERE last_used < (now - windowDays * 86400000)

updateEdgeWeight(sourceId: string, targetId: string, relationType: string, weight: number): void
```

---

## Section 5: Source Citations

### Population in `RetrievalEngine`

When hydrating a `SemanticRecord` or `EpisodeRecord` into `RetrievedMemory`, populate citation fields from the DB record:

```typescript
function buildCitationLabel(sourceFile: string | undefined, domain: string | undefined, createdAt: number | undefined): string {
  const parts: string[] = [];
  if (sourceFile) parts.push(sourceFile);
  else if (domain) parts.push(domain);
  if (createdAt) {
    const daysAgo = Math.floor((Date.now() - createdAt) / 86400000);
    parts.push(daysAgo === 0 ? 'today' : `${daysAgo}d ago`);
  }
  return parts.join(' · ');
}
```

`sourceFile` is read from the `tags` field: if tags contain `source:MEMORY.md`, extract `"MEMORY.md"`. Otherwise fall back to the vault `file_path` basename.

---

## Section 6: Forgetting Safety Nets

Three tiers applied in order during the dream cycle forgetting phase:

### Tier 1 — Retention decay (existing)
`retention = exp(-ageDays / (half_life * max(importance, 0.1)))`. Entries below `min_importance_to_keep` are drop candidates.

### Tier 2 — Merge before drop
Before archiving a drop candidate:
1. Find all entries in the same domain with `retention >= 0.5` (survivors).
2. For each survivor, run FTS search for terms from the candidate's content.
3. If any match found: append candidate's content as a collapsed footnote to the survivor's vault file; mark candidate as `archived` in DB without writing to `vault/archive/`.
4. If no match: archive normally (existing behavior).

Controlled by `config.memory.forgetting.merge_before_drop`.

### Tier 3 — Unforgettable categories
Before applying Tier 1 decay or Tier 2 merge, check if entry is protected:

```typescript
function isForgettable(entry: SemanticRecord, config: NeuroclawConfig): boolean {
  // Tags-based protection
  if (entry.tags.includes('migration')) return false;
  // Domain-based protection
  if (config.memory.forgetting.unforgettable_categories.includes(entry.domain)) return false;
  return true;
}
```

Episode protection:
- Episodes with `is_correction: true` are never archived.

---

## Section 7: CLI

### `neuroclaw migrate`

```bash
neuroclaw migrate --from <dir>             # scan + import
neuroclaw migrate --from <dir> --dry-run   # preview without writing
neuroclaw migrate --from <dir> --scan      # report found files only
```

Scan output:
```
Found in /path/to/project:
  MEMORY.md              → 4 semantic entries (coding-preferences, git-workflow, ...)
  memory/2026-03-01.md   → 1 episodic entry
  memory/2026-03-15.md   → 1 episodic entry

Run without --dry-run to import 6 entries.
```

Run output:
```
Migrated 6 entries from /path/to/project
  4 semantic  (MEMORY.md)
  2 episodic  (memory/)
```

### `neuroclaw ingest`

```bash
neuroclaw ingest <path>
neuroclaw ingest <path> --type semantic --domain api
neuroclaw ingest <path> --dry-run
neuroclaw ingest ./docs/ --recursive
```

### Engine facades

```typescript
// packages/core/src/engine.ts
async migrateFromOpenClaw(workDir: string, options?: { dryRun?: boolean }): Promise<MigrationReport>
async ingestFile(filePath: string, options?: Omit<IngestInput, 'filePath' | 'content'>): Promise<IngestResult>
```

---

## Testing Strategy

- `ingester.test.ts`: H2 splitting, paragraph fallback, domain derivation, dry-run no-write, vault file written correctly, DB entry created, FTS indexed
- `migrator.test.ts`: scan finds MEMORY.md + daily files, skips missing files, classification rules applied, dry-run propagated to Ingester, source files untouched
- `sqlite.test.ts`: `incrementEdgeWeight()` caps at 2.0, `getStaleEdges()` filters correctly, `tags` column persisted
- `dream.test.ts`: Tier 2 merge appends content, Tier 3 protects migration-tagged entries and `is_correction` episodes, unforgettable_categories config respected
- `retrieval.test.ts`: citation fields populated on graph-walk results, GSEM weight incremented after traversal
