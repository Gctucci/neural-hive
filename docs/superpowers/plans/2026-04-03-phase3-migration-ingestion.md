# Phase 3: Migration, Ingestion, GSEM & Forgetting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement OpenClaw memory migration, a general-purpose markdown ingester, GSEM edge-weight refinement, source citations on retrieved memories, and three-tier forgetting safety nets.

**Architecture:** Shared `Ingester` pipeline (split → classify → vault write → DB insert → FTS index) wrapped by `Migrator` for OpenClaw-specific detection. GSEM and citations extend `RetrievalEngine`. Forgetting safety nets extend `DreamCycle.archiveLowRetention()`. Two new CLI commands via engine facades.

**Tech Stack:** TypeScript, better-sqlite3, Vitest, Node.js fs, commander

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/memory/src/ingester.ts` | `Ingester` — content splitting, vault write, DB insert, FTS index |
| `packages/memory/src/migrator.ts` | `Migrator` — OpenClaw file detection, classification, wraps Ingester |
| `packages/memory/src/__tests__/ingester.test.ts` | Tests for Ingester |
| `packages/memory/src/__tests__/migrator.test.ts` | Tests for Migrator |

### Modified Files

| File | Change |
|------|--------|
| `packages/config/src/types.ts` | Add `tags: string` to `SemanticRecord`; add citation fields to `RetrievedMemory` |
| `packages/memory/src/sqlite.ts` | Add `tags` column (with migration check); add `incrementEdgeWeight`, `getStaleEdges`, `updateEdgeWeight` |
| `packages/memory/src/retrieval.ts` | Add citation fields to local `RetrievedMemory`; GSEM calls in `graphWalkSearch`; populate citations in `hydrateScored` |
| `packages/memory/src/index.ts` | Export `Ingester`, `Migrator` and their types |
| `packages/core/src/dream.ts` | Tier 2 (merge-before-drop) and Tier 3 (tag/domain protection) in `archiveLowRetention`; GSEM edge decay |
| `packages/core/src/engine.ts` | Add `migrateFromOpenClaw()` and `ingestFile()` facades |
| `packages/core/src/cli.ts` | Add `migrate` and `ingest` subcommands |
| `packages/core/src/__tests__/dream.test.ts` | Add forgetting safety net tests |

---

## Task 1: Data Model Extensions

**Files:**
- Modify: `packages/config/src/types.ts`
- Modify: `packages/memory/src/retrieval.ts`
- Modify: `packages/memory/src/sqlite.ts`
- Modify: `packages/memory/src/__tests__/sqlite.test.ts`
- Modify: `packages/memory/src/__tests__/retrieval.test.ts`
- Modify: `packages/core/src/dream.ts`

- [ ] **Step 1: Write failing test for `tags` field on SemanticRecord**

In `packages/memory/src/__tests__/sqlite.test.ts`, add to the `describe("semantic")` block:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory 2>&1 | grep -A5 "tags"`

Expected: TypeScript compile error — `tags` does not exist on type `SemanticRecord`.

- [ ] **Step 3: Add `tags` to `SemanticRecord` in config/types.ts**

In `packages/config/src/types.ts`, update `SemanticRecord`:

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
  tags: string;  // comma-separated, e.g. "migration,source:MEMORY.md"
}
```

- [ ] **Step 4: Add `tags` column to SCHEMA in sqlite.ts**

In `packages/memory/src/sqlite.ts`, update the `semantic` table in `SCHEMA`:

```sql
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
```

Add a migration check in `NeuroclawDB.create()`, immediately after `db.exec(SCHEMA)`:

```typescript
// Migrate existing DBs: add tags column if missing
const semanticCols = db.pragma("table_info(semantic)") as Array<{ name: string }>;
if (!semanticCols.some((c) => c.name === "tags")) {
  db.exec("ALTER TABLE semantic ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
}
```

Update `insertSemantic` to include `tags`:

```typescript
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
```

- [ ] **Step 5: Fix all existing `SemanticRecord` objects to include `tags: ""`**

Every `insertSemantic` call in existing files must include `tags: ""`. Update these files:

**`packages/memory/src/__tests__/sqlite.test.ts`** — all existing `insertSemantic` calls (there are ~8):
Add `tags: "",` to each. Example:
```typescript
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
  tags: "",           // <-- add this line to every existing insertSemantic call
});
```

**`packages/memory/src/__tests__/retrieval.test.ts`** — all `insertSemantic` calls: add `tags: ""` to each.

**`packages/core/src/dream.ts`** — two `SemanticRecord` objects in `replayEpisode()` (the novel branch and the no-match branch). Add `tags: ""` to both:
```typescript
const semRecord: SemanticRecord = {
  id: semId,
  domain: distilled.domain,
  created: Date.now(),
  last_accessed: Date.now(),
  importance: episode.importance,
  ref_count: 0,
  confidence: 0.5,
  file_path: filePath,
  line_range: null,
  half_life: halfLife,
  retention: 1.0,
  source_episode_ids: episode.id,
  tags: "",    // <-- add this
};
```

- [ ] **Step 6: Add citation fields to `RetrievedMemory` in retrieval.ts**

In `packages/memory/src/retrieval.ts`, update the `RetrievedMemory` interface:

```typescript
export interface RetrievedMemory {
  id: string;
  type: "semantic" | "episodic" | "working";
  content: string;
  importance: number;
  relevanceScore: number;
  source: string;
  created: string;
  // Citation fields (populated from DB on retrieval)
  sourceFile?: string;    // e.g. "MEMORY.md" extracted from tags
  domain?: string;        // e.g. "coding-preferences"
  createdAt?: number;     // raw ms timestamp
  citationLabel?: string; // e.g. "MEMORY.md · coding-preferences · 3d ago"
}
```

- [ ] **Step 7: Run memory tests**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All 65 + 1 new = 66 tests pass.

- [ ] **Step 8: Run full test suite**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/config/src/types.ts \
        packages/memory/src/sqlite.ts \
        packages/memory/src/retrieval.ts \
        packages/memory/src/__tests__/sqlite.test.ts \
        packages/memory/src/__tests__/retrieval.test.ts \
        packages/core/src/dream.ts
git commit -m "feat: add tags to SemanticRecord and citation fields to RetrievedMemory"
```

---

## Task 2: SQLite GSEM Methods

**Files:**
- Modify: `packages/memory/src/sqlite.ts`
- Modify: `packages/memory/src/__tests__/sqlite.test.ts`

- [ ] **Step 1: Write failing tests for GSEM methods**

Add to `packages/memory/src/__tests__/sqlite.test.ts` inside `describe("NeuroclawDB")`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory 2>&1 | grep -A3 "GSEM\|incrementEdge\|getStale\|updateEdge"`

Expected: FAIL — methods do not exist yet.

- [ ] **Step 3: Implement GSEM methods in sqlite.ts**

Add to `NeuroclawDB` class in `packages/memory/src/sqlite.ts`, after `getRelationsTo()`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All 66 + 5 new = 71 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/sqlite.ts \
        packages/memory/src/__tests__/sqlite.test.ts
git commit -m "feat: add GSEM edge methods to NeuroclawDB (incrementEdgeWeight, getStaleEdges, updateEdgeWeight)"
```

---

## Task 3: Ingester

**Files:**
- Create: `packages/memory/src/ingester.ts`
- Create: `packages/memory/src/__tests__/ingester.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/memory/src/__tests__/ingester.test.ts`:

```typescript
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
      "Short line.",   // 11 chars — should merge with next
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

    // Vault file should NOT exist
    expect(fs.existsSync(path.join(tmpDir, "semantic/domains", "test-section"))).toBe(false);

    // DB should be empty
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

    // Vault file should exist
    const vaultContent = vault.read(entry.vaultPath);
    expect(vaultContent).not.toBeNull();
    expect(vaultContent).toContain("Some knowledge here.");
    expect(vaultContent).toContain("source: MEMORY.md");

    // DB record should exist
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory 2>&1 | grep -A5 "ingester"`

Expected: FAIL — `../ingester` module not found.

- [ ] **Step 3: Implement ingester.ts**

Create `packages/memory/src/ingester.ts`:

```typescript
import * as path from "node:path";
import type { SemanticRecord, EpisodeRecord, MemoryType } from "@neuroclaw/config";
import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";
import { computeImportance } from "./importance";

export interface IngestInput {
  filePath: string;
  content: string;
  type?: MemoryType;
  domain?: string;
  dryRun?: boolean;
  tags?: string;
}

export interface IngestedEntry {
  id: string;
  type: MemoryType;
  domain: string;
  vaultPath: string;
  sourceFile: string;
  content: string;
  importance: number;
}

export interface IngestResult {
  entries: IngestedEntry[];
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function deriveDomain(heading: string): string {
  return (
    heading
      .replace(/^#+\s*/, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "general"
  );
}

interface Section {
  heading: string;
  body: string;
  domain: string;
}

function splitByH2(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join("\n").trim();
    if (body.length > 0) {
      sections.push({
        heading: currentHeading,
        body,
        domain: deriveDomain(currentHeading),
      });
    }
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

function splitByParagraph(content: string): string[] {
  const paras = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const merged: string[] = [];
  for (const para of paras) {
    if (merged.length > 0 && merged[merged.length - 1].length < 50) {
      merged[merged.length - 1] = merged[merged.length - 1] + "\n\n" + para;
    } else {
      merged.push(para);
    }
  }
  return merged;
}

function hasH2(content: string): boolean {
  return content.split("\n").some((l) => l.startsWith("## "));
}

function extractDateFromPath(filePath: string): string {
  const basename = path.basename(filePath, ".md");
  // Matches YYYY-MM-DD pattern
  if (/^\d{4}-\d{2}-\d{2}$/.test(basename)) return basename;
  return new Date().toISOString().slice(0, 10);
}

function buildFrontmatter(
  id: string,
  sourceFile: string,
  domain: string,
  tags: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    "---",
    `id: ${id}`,
    `source: ${sourceFile}`,
    `domain: ${domain}`,
    `tags: ${tags}`,
    `imported: ${date}`,
    "---",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Ingester
// ---------------------------------------------------------------------------

export class Ingester {
  private db: NeuroclawDB;
  private vault: Vault;

  constructor(db: NeuroclawDB, vault: Vault) {
    this.db = db;
    this.vault = vault;
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const {
      filePath,
      content,
      type,
      domain: domainOverride,
      dryRun = false,
      tags = "",
    } = input;

    const sourceFile = path.basename(filePath);
    const isMigration = tags.includes("migration");
    const baseWeight = isMigration ? 0.6 : 0.5;

    const resolvedType: MemoryType = type ?? "semantic";

    let sections: Array<{ domain: string; body: string }>;

    if (resolvedType === "episodic") {
      // Whole file as a single episodic entry
      sections = [{ domain: domainOverride ?? "daily-memory", body: content.trim() }];
    } else if (domainOverride) {
      // Domain override — still split for multiple sections but force domain
      if (hasH2(content)) {
        sections = splitByH2(content).map((s) => ({ ...s, domain: domainOverride }));
      } else {
        sections = splitByParagraph(content).map((body) => ({
          domain: domainOverride,
          body,
        }));
      }
    } else if (hasH2(content)) {
      sections = splitByH2(content);
    } else {
      sections = splitByParagraph(content).map((body) => ({
        domain: "general",
        body,
      }));
    }

    const entries: IngestedEntry[] = [];

    for (const section of sections) {
      if (!section.body) continue;

      const importance = computeImportance({
        baseWeight,
        recencyFactor: 1.0,
        refCount: 0,
        outcomeSignal: 0,
        isCorrection: false,
        valenceMagnitude: 0,
      });

      if (resolvedType === "episodic") {
        const id = generateId("ep");
        const date = extractDateFromPath(filePath);
        const vaultPath = `episodic/${date}/${id}.md`;
        const frontmatter = buildFrontmatter(id, sourceFile, section.domain, tags);
        const fileContent = frontmatter + section.body + "\n";

        entries.push({
          id,
          type: "episodic",
          domain: section.domain,
          vaultPath,
          sourceFile,
          content: section.body,
          importance,
        });

        if (!dryRun) {
          this.vault.write(vaultPath, fileContent);

          const now = Date.now();
          const record: EpisodeRecord = {
            id,
            timestamp: now,
            session_id: "migration",
            project: null,
            importance,
            is_correction: false,
            outcome_signal: 0,
            consolidation_status: "migrated",
            file_path: vaultPath,
            summary: section.body.slice(0, 200),
            valence: 0,
            arousal: 0,
            context_snippet: "",
          };
          this.db.insertEpisode(record);
          this.db.indexContent(id, "episodic", section.body);
        }
      } else {
        const id = generateId("sem");
        const vaultPath = `semantic/domains/${section.domain}/${id}.md`;
        const frontmatter = buildFrontmatter(id, sourceFile, section.domain, tags);
        const fileContent = frontmatter + section.body + "\n";

        entries.push({
          id,
          type: "semantic",
          domain: section.domain,
          vaultPath,
          sourceFile,
          content: section.body,
          importance,
        });

        if (!dryRun) {
          this.vault.write(vaultPath, fileContent);

          const now = Date.now();
          const record: SemanticRecord = {
            id,
            domain: section.domain,
            created: now,
            last_accessed: now,
            importance,
            ref_count: 0,
            confidence: 0.8,
            file_path: vaultPath,
            line_range: null,
            half_life: 30,
            retention: 1.0,
            source_episode_ids: "",
            tags,
          };
          this.db.insertSemantic(record);
          this.db.indexContent(id, "semantic", section.body);
        }
      }
    }

    return { entries, dryRun };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All 71 + 9 new = 80 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/ingester.ts \
        packages/memory/src/__tests__/ingester.test.ts
git commit -m "feat: add Ingester — H2 splitting, vault write, DB insert, FTS index"
```

---

## Task 4: Migrator

**Files:**
- Create: `packages/memory/src/migrator.ts`
- Create: `packages/memory/src/__tests__/migrator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/memory/src/__tests__/migrator.test.ts`:

```typescript
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
      // No files created — MEMORY.md doesn't exist
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory 2>&1 | grep -A5 "migrator"`

Expected: FAIL — `../migrator` module not found.

- [ ] **Step 3: Implement migrator.ts**

Create `packages/memory/src/migrator.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { Ingester, IngestedEntry, IngestResult } from "./ingester";

export interface MigrationManifestFile {
  path: string;
  fileType: "memory" | "daily";
  exists: boolean;
}

export interface MigrationManifest {
  workDir: string;
  files: MigrationManifestFile[];
}

export interface MigrationReport {
  workDir: string;
  scanned: number;
  imported: number;
  skipped: number;
  entries: IngestedEntry[];
  dryRun: boolean;
}

const DAILY_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

export class Migrator {
  private ingester: Ingester;

  constructor(ingester: Ingester) {
    this.ingester = ingester;
  }

  scan(workDir: string): MigrationManifest {
    const files: MigrationManifestFile[] = [];

    // MEMORY.md
    const memoryPath = path.join(workDir, "MEMORY.md");
    files.push({
      path: memoryPath,
      fileType: "memory",
      exists: fs.existsSync(memoryPath),
    });

    // memory/YYYY-MM-DD.md files
    const memoryDir = path.join(workDir, "memory");
    if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
      const dailyFiles = fs
        .readdirSync(memoryDir)
        .filter((f) => DAILY_PATTERN.test(f))
        .sort();

      for (const file of dailyFiles) {
        files.push({
          path: path.join(memoryDir, file),
          fileType: "daily",
          exists: true,
        });
      }
    }

    return { workDir, files };
  }

  async run(
    manifest: MigrationManifest,
    options?: { dryRun?: boolean }
  ): Promise<MigrationReport> {
    const dryRun = options?.dryRun ?? false;
    const allEntries: IngestedEntry[] = [];
    let skipped = 0;

    for (const file of manifest.files) {
      if (!file.exists) {
        skipped++;
        continue;
      }

      const content = fs.readFileSync(file.path, "utf-8");
      const sourceFile = path.basename(file.path);

      let result: IngestResult;

      if (file.fileType === "memory") {
        result = await this.ingester.ingest({
          filePath: file.path,
          content,
          type: "semantic",
          tags: `migration,source:MEMORY.md`,
          dryRun,
        });
      } else {
        // daily
        result = await this.ingester.ingest({
          filePath: file.path,
          content,
          type: "episodic",
          tags: `migration,source:${sourceFile}`,
          dryRun,
        });
      }

      allEntries.push(...result.entries);
    }

    return {
      workDir: manifest.workDir,
      scanned: manifest.files.length,
      imported: allEntries.length,
      skipped,
      entries: allEntries,
      dryRun,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All 80 + 8 new = 88 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/migrator.ts \
        packages/memory/src/__tests__/migrator.test.ts
git commit -m "feat: add Migrator — OpenClaw MEMORY.md and daily memory ingestion"
```

---

## Task 5: GSEM + Source Citations in RetrievalEngine

**Files:**
- Modify: `packages/memory/src/retrieval.ts`
- Modify: `packages/memory/src/__tests__/retrieval.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/memory/src/__tests__/retrieval.test.ts`:

```typescript
describe("GSEM edge weight refinement", () => {
  it("increments edge weight after graph-walk traversal", () => {
    // Insert two semantic entries with a relation
    db.insertSemantic({
      id: "sem-gsem-a",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.8,
      ref_count: 0,
      confidence: 0.9,
      file_path: "semantic/domains/auth/sem-gsem-a.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "",
    });
    db.insertSemantic({
      id: "sem-gsem-b",
      domain: "security",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 0,
      confidence: 0.8,
      file_path: "semantic/domains/security/sem-gsem-b.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "",
    });
    db.insertRelation({
      source_id: "sem-gsem-a",
      target_id: "sem-gsem-b",
      relation_type: "supports",
      weight: 1.0,
      created: Date.now(),
      last_used: Date.now(),
      provenance: "rule",
      confidence: 1.0,
    });

    vault.write(
      "semantic/domains/auth/sem-gsem-a.md",
      "Auth middleware session validation"
    );
    vault.write(
      "semantic/domains/security/sem-gsem-b.md",
      "Security token validation"
    );
    db.indexContent("sem-gsem-a", "semantic", "Auth middleware session validation");

    retrieval.search("how does auth relate to security");

    const rels = db.getRelationsFrom("sem-gsem-a");
    // Weight should have been incremented
    expect(rels[0].weight).toBeGreaterThan(1.0);
  });
});

describe("source citations", () => {
  it("populates citationLabel on FTS results for migration-tagged entries", () => {
    db.insertSemantic({
      id: "sem-cite-1",
      domain: "coding-preferences",
      created: Date.now() - 3 * 86_400_000,  // 3 days ago
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 0,
      confidence: 0.8,
      file_path: "semantic/domains/coding-preferences/sem-cite-1.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "migration,source:MEMORY.md",
    });
    vault.write(
      "semantic/domains/coding-preferences/sem-cite-1.md",
      "I prefer TypeScript strict mode"
    );
    db.indexContent("sem-cite-1", "semantic", "I prefer TypeScript strict mode");

    const results = retrieval.search("TypeScript strict");
    expect(results).toHaveLength(1);
    expect(results[0].sourceFile).toBe("MEMORY.md");
    expect(results[0].domain).toBe("coding-preferences");
    expect(results[0].createdAt).toBeDefined();
    expect(results[0].citationLabel).toMatch(/MEMORY\.md/);
    expect(results[0].citationLabel).toMatch(/\d+d ago|today/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory 2>&1 | grep -E "GSEM|citation|FAIL"`

Expected: FAIL — `citationLabel` is undefined, edge weight is unchanged.

- [ ] **Step 3: Add GSEM calls in graphWalkSearch**

In `packages/memory/src/retrieval.ts`, update `graphWalkSearch`. After the hop1 loop, add `incrementEdgeWeight` calls for traversed edges:

```typescript
private graphWalkSearch(query: string, limit: number): RetrievedMemory[] {
  const ftsQuery = extractKeywords(query);
  if (!ftsQuery) return [];
  const seeds = this.db.searchFTS(ftsQuery, 3);
  if (seeds.length === 0) return [];

  const scored = new Map<string, { score: number; sourceType: string }>();

  for (const seed of seeds) {
    scored.set(seed.source_id, {
      score: Math.abs(seed.rank),
      sourceType: seed.source_type,
    });
  }

  const DEPTH_DECAY = 0.7;

  for (const seed of seeds) {
    const seedScore = Math.abs(seed.rank);

    const hop1 = [
      ...this.db.getRelationsFrom(seed.source_id),
      ...this.db.getRelationsTo(seed.source_id),
    ];

    for (const rel of hop1) {
      const neighborId =
        rel.source_id === seed.source_id ? rel.target_id : rel.source_id;
      const score = seedScore * rel.weight * DEPTH_DECAY;
      const existing = scored.get(neighborId);
      if (!existing || score > existing.score) {
        scored.set(neighborId, { score, sourceType: "semantic" });
      }

      // GSEM: increment edge weight for traversed hop-1 edge
      this.db.incrementEdgeWeight(
        rel.source_id,
        rel.target_id,
        rel.relation_type
      );

      const hop2 = [
        ...this.db.getRelationsFrom(neighborId),
        ...this.db.getRelationsTo(neighborId),
      ];

      for (const rel2 of hop2) {
        const neighbor2Id =
          rel2.source_id === neighborId ? rel2.target_id : rel2.source_id;
        if (neighbor2Id === seed.source_id) continue;
        const score2 =
          seedScore * rel.weight * rel2.weight * DEPTH_DECAY * DEPTH_DECAY;
        const existing2 = scored.get(neighbor2Id);
        if (!existing2 || score2 > existing2.score) {
          scored.set(neighbor2Id, { score: score2, sourceType: "semantic" });
        }

        // GSEM: increment edge weight for traversed hop-2 edge
        this.db.incrementEdgeWeight(
          rel2.source_id,
          rel2.target_id,
          rel2.relation_type
        );
      }
    }
  }

  const sorted = [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  return this.hydrateScored(sorted);
}
```

- [ ] **Step 4: Add citation population in hydrateScored**

Add helper functions before the `RetrievalEngine` class, and update `hydrateScored`:

```typescript
function parseCitationSource(tags: string): string | undefined {
  const parts = tags.split(",");
  const sourceTag = parts.find((t) => t.startsWith("source:"));
  return sourceTag ? sourceTag.slice("source:".length) : undefined;
}

function buildCitationLabel(
  sourceFile: string | undefined,
  domain: string,
  createdAt: number
): string {
  const daysAgo = Math.floor((Date.now() - createdAt) / 86_400_000);
  const age = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
  const src = sourceFile ?? domain;
  return `${src} · ${age}`;
}
```

Update `hydrateScored`:

```typescript
private hydrateScored(
  entries: Array<[string, { score: number; sourceType: string }]>
): RetrievedMemory[] {
  const memories: RetrievedMemory[] = [];

  for (const [id, { score }] of entries) {
    const record = this.db.getSemantic(id);
    if (!record) continue;

    const content = this.vault.read(record.file_path);
    if (!content) continue;

    const sourceFile = parseCitationSource(record.tags ?? "");
    const citationLabel = buildCitationLabel(
      sourceFile,
      record.domain,
      record.created
    );

    memories.push({
      id: record.id,
      type: "semantic",
      content,
      importance: record.importance,
      relevanceScore: score,
      source: record.file_path,
      created: String(record.created),
      sourceFile,
      domain: record.domain,
      createdAt: record.created,
      citationLabel,
    });
  }

  return memories;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/memory`

Expected: All 88 + 2 new = 90 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/memory/src/retrieval.ts \
        packages/memory/src/__tests__/retrieval.test.ts
git commit -m "feat: add GSEM edge weight updates and source citations to RetrievalEngine"
```

---

## Task 6: Forgetting Safety Nets

**Files:**
- Modify: `packages/core/src/dream.ts`
- Modify: `packages/core/src/__tests__/dream.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/core/src/__tests__/dream.test.ts` a new `describe` block:

```typescript
describe("DreamCycle forgetting safety nets", () => {
  beforeEach(() => {
    setup();
  });

  afterEach(() => {
    teardown();
  });

  it("Tier 3: does not archive migration-tagged semantic entries", async () => {
    // Insert a very old, low-retention migration entry
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000; // 200 days ago
    db.insertSemantic({
      id: "sem-migration",
      domain: "coding-preferences",
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/coding-preferences/sem-migration.md",
      line_range: null,
      half_life: 10,
      retention: 0.01, // way below threshold
      source_episode_ids: "",
      tags: "migration,source:MEMORY.md",
    });
    vault.write(
      "semantic/domains/coding-preferences/sem-migration.md",
      "Important preference"
    );

    await capture.capture({
      sessionId: "s1",
      project: "test",
      interactionText: "Something happened",
      summary: "Work done",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    // Entry should NOT be archived — tags include "migration"
    const entry = db.getSemantic("sem-migration");
    expect(entry).not.toBeNull();
  });

  it("Tier 3: does not archive entries in unforgettable_categories domains", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000;
    db.insertSemantic({
      id: "sem-identity",
      domain: "identity",  // unforgettable by default config
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/identity/sem-identity.md",
      line_range: null,
      half_life: 10,
      retention: 0.01,
      source_episode_ids: "",
      tags: "",
    });
    vault.write("semantic/domains/identity/sem-identity.md", "Core identity trait");

    await capture.capture({
      sessionId: "s2",
      project: "test",
      interactionText: "Something happened",
      summary: "Work done",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const entry = db.getSemantic("sem-identity");
    expect(entry).not.toBeNull();
  });

  it("Tier 2: merges drop candidate into same-domain survivor before archiving", async () => {
    const now = Date.now();
    const veryOld = now - 200 * 24 * 60 * 60 * 1000;

    // Survivor: healthy entry in same domain
    db.insertSemantic({
      id: "sem-survivor",
      domain: "typescript",
      created: now,
      last_accessed: now,
      importance: 0.8,
      ref_count: 5,
      confidence: 0.9,
      file_path: "semantic/domains/typescript/sem-survivor.md",
      line_range: null,
      half_life: 30,
      retention: 0.9,
      source_episode_ids: "",
      tags: "",
    });
    vault.write(
      "semantic/domains/typescript/sem-survivor.md",
      "TypeScript strict mode is preferred"
    );
    db.indexContent("sem-survivor", "semantic", "TypeScript strict mode preferred");

    // Candidate: old, low retention in same domain
    db.insertSemantic({
      id: "sem-candidate",
      domain: "typescript",
      created: veryOld,
      last_accessed: veryOld,
      importance: 0.1,
      ref_count: 0,
      confidence: 0.5,
      file_path: "semantic/domains/typescript/sem-candidate.md",
      line_range: null,
      half_life: 10,
      retention: 0.01,
      source_episode_ids: "",
      tags: "",
    });
    vault.write(
      "semantic/domains/typescript/sem-candidate.md",
      "TypeScript types are useful"
    );

    await capture.capture({
      sessionId: "s3",
      project: "test",
      interactionText: "TypeScript helps catch bugs",
      summary: "TypeScript usage",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    // Survivor should have the candidate's content merged into it
    const survivorContent = vault.read("semantic/domains/typescript/sem-survivor.md");
    expect(survivorContent).toContain("TypeScript types are useful");
  });

  it("GSEM: decays stale edge weights during dream cycle", async () => {
    const staleTime = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
    db.insertRelation({
      source_id: "sem-x",
      target_id: "sem-y",
      relation_type: "supports",
      weight: 1.0,
      created: staleTime,
      last_used: staleTime,
      provenance: "rule",
      confidence: 1.0,
    });

    await capture.capture({
      sessionId: "s4",
      project: "test",
      interactionText: "Some work done",
      summary: "Work summary",
      isCorrection: false,
      outcomeSignal: 0.5,
    });
    await dream.run();

    const rels = db.getRelationsFrom("sem-x");
    if (rels.length > 0) {
      expect(rels[0].weight).toBeLessThan(1.0);
      expect(rels[0].weight).toBeGreaterThanOrEqual(0.1);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core 2>&1 | grep -E "Tier|GSEM|FAIL"`

Expected: FAIL — Tier 2/3 logic and GSEM decay not implemented.

- [ ] **Step 3: Implement forgetting safety nets in dream.ts**

Replace `archiveLowRetention()` in `packages/core/src/dream.ts`:

```typescript
private archiveLowRetention(): number {
  const allSemantic = this.db.getAllSemanticEntries();
  const minImportance = this.config.memory.forgetting.min_importance_to_keep;
  const unforgettableCategories = this.config.memory.forgetting.unforgettable_categories;
  const mergeBeforeDrop = this.config.memory.forgetting.merge_before_drop;
  let archived = 0;

  for (const entry of allSemantic) {
    // Tier 3: never archive migration-tagged or unforgettable-domain entries
    if (entry.tags.includes("migration")) continue;
    if (unforgettableCategories.includes(entry.domain)) continue;

    if (entry.retention >= minImportance) continue;

    // Tier 2: merge before drop
    if (mergeBeforeDrop) {
      const merged = this.tryMergeIntoDomainSurvivor(entry);
      if (merged) {
        archived++;
        continue;
      }
    }

    // Archive normally
    const content = this.vault.read(entry.file_path);
    if (content) {
      this.vault.write(`archive/${entry.id}.md`, content);
    }
    archived++;
  }

  return archived;
}

private tryMergeIntoDomainSurvivor(candidate: SemanticRecord): boolean {
  // Find survivors: same domain, retention >= 0.5
  const sameDomain = this.db.getSemanticByDomain(candidate.domain);
  const survivors = sameDomain.filter(
    (s) => s.id !== candidate.id && s.retention >= 0.5
  );
  if (survivors.length === 0) return false;

  const candidateContent = this.vault.read(candidate.file_path);
  if (!candidateContent) return false;

  // Check for FTS keyword overlap with any survivor
  const keywords = this.sanitizeFtsQuery(candidateContent);
  if (!keywords) return false;

  let ftsResults: Array<{ source_id: string; source_type: string; rank: number }> = [];
  try {
    ftsResults = this.db.searchFTS(keywords, 10);
  } catch {
    return false;
  }

  const survivorIds = new Set(survivors.map((s) => s.id));
  const matchedSurvivor = ftsResults.find((r) => survivorIds.has(r.source_id));
  if (!matchedSurvivor) return false;

  const survivor = survivors.find((s) => s.id === matchedSurvivor.source_id)!;
  const survivorContent = this.vault.read(survivor.file_path) ?? "";

  // Append candidate content as footnote to survivor
  const footnote = `\n\n<!-- merged from ${candidate.id} -->\n${candidateContent}\n`;
  this.vault.write(survivor.file_path, survivorContent + footnote);

  return true;
}
```

- [ ] **Step 4: Add GSEM edge decay to dream cycle**

In `packages/core/src/dream.ts`, update the `run()` method. After `this.applyForgettingCurves(now)`, add edge decay:

```typescript
// -- Phase 3: Consolidation --
for (const episode of pending) {
  this.db.updateEpisodeStatus(episode.id, "consolidated");
}
this.applyForgettingCurves(now);
this.decayStaleEdges(now);
```

Add the new method:

```typescript
private decayStaleEdges(now: number): void {
  const windowDays = this.config.memory.forgetting.decay_window_days;
  const staleEdges = this.db.getStaleEdges(windowDays);
  for (const edge of staleEdges) {
    const newWeight = Math.max(edge.weight * 0.9, 0.1);
    this.db.updateEdgeWeight(
      edge.source_id,
      edge.target_id,
      edge.relation_type,
      newWeight
    );
  }
}
```

Also update `applyForgettingCurves` to also protect migration-tagged entries (it currently only checks domain):

```typescript
private applyForgettingCurves(now: number): void {
  if (!this.config.memory.forgetting.enabled) return;

  const allSemantic = this.db.getAllSemanticEntries();
  const unforgettable = this.config.memory.forgetting.unforgettable_categories;

  for (const entry of allSemantic) {
    if (entry.tags.includes("migration")) continue;
    if (unforgettable.includes(entry.domain)) continue;

    const ageDays = (now - entry.created) / MS_PER_DAY;
    const effectiveImportance = Math.max(entry.importance, 0.1);
    const retention = Math.exp(-ageDays / (entry.half_life * effectiveImportance));

    this.db.updateSemanticRetention(entry.id, retention, entry.half_life);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core`

Expected: All 40 + 4 new = 44 tests pass.

- [ ] **Step 6: Run full test suite**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests pass across all packages.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/dream.ts \
        packages/core/src/__tests__/dream.test.ts
git commit -m "feat: add 3-tier forgetting safety nets and GSEM edge decay to DreamCycle"
```

---

## Task 7: Engine Facades, CLI, and Exports

**Files:**
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/src/cli.ts`

- [ ] **Step 1: Export Ingester and Migrator from memory package**

Update `packages/memory/src/index.ts`:

```typescript
// @neuroclaw/memory
export { EpisodeCapture, type CaptureInput } from "./capture";
export { Vault } from "./vault";
export { NeuroclawDB } from "./sqlite";
export { WorkingMemory } from "./working-memory";
export { computeImportance, type ImportanceInput } from "./importance";
export { RetrievalEngine, classifyQuery, type RetrievedMemory, type QueryType } from "./retrieval";
export {
  LocalValenceScorer,
  LLMValenceScorer,
  type ValenceResult,
  type ValenceScorer,
  type LLMCallFn,
} from "./valence";
export { Ingester, type IngestInput, type IngestedEntry, type IngestResult } from "./ingester";
export { Migrator, type MigrationManifest, type MigrationReport } from "./migrator";
```

- [ ] **Step 2: Add engine facades**

In `packages/core/src/engine.ts`:

Add imports at the top:
```typescript
import * as fs from "node:fs";
import { Ingester, Migrator } from "@neuroclaw/memory";
import type { IngestInput, IngestResult, MigrationReport } from "@neuroclaw/memory";
```

Add two methods to `NeuroclawEngine`:

```typescript
async migrateFromOpenClaw(
  workDir: string,
  options?: { dryRun?: boolean }
): Promise<MigrationReport> {
  const ingester = new Ingester(this.db, this.vault);
  const migrator = new Migrator(ingester);
  const manifest = migrator.scan(workDir);
  return migrator.run(manifest, options);
}

async ingestFile(
  filePath: string,
  options?: Omit<IngestInput, "filePath" | "content">
): Promise<IngestResult> {
  const content = fs.readFileSync(filePath, "utf-8");
  const ingester = new Ingester(this.db, this.vault);
  return ingester.ingest({ filePath, content, ...options });
}
```

- [ ] **Step 3: Add CLI commands**

In `packages/core/src/cli.ts`, add the following commands before `return program`:

```typescript
// neuroclaw migrate
program
  .command("migrate")
  .description("Import OpenClaw MEMORY.md and memory/ files into NeuroClaw vault")
  .requiredOption("--from <dir>", "OpenClaw project directory to migrate from")
  .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
  .option("--agent <id>", "Agent ID")
  .option("--dry-run", "Preview without writing", false)
  .option("--scan", "Only scan and report files found, no import", false)
  .action(async (opts) => {
    try {
      const engine = new NeuroclawEngine(opts.configDir, opts.agent);
      await engine.init();

      if (opts.scan) {
        // Import Migrator directly for scan-only mode
        const { Ingester: Ing, Migrator: Mig } = await import("@neuroclaw/memory");
        // We can't easily get db/vault from engine, so just report file existence
        const fs2 = await import("node:fs");
        const path2 = await import("node:path");
        const memoryPath = path2.join(opts.from, "MEMORY.md");
        const memoryDir = path2.join(opts.from, "memory");
        console.log(`Scanning ${opts.from}:`);
        if (fs2.existsSync(memoryPath)) {
          console.log(`  MEMORY.md              → found`);
        } else {
          console.log(`  MEMORY.md              → not found`);
        }
        if (fs2.existsSync(memoryDir)) {
          const dailyFiles = fs2
            .readdirSync(memoryDir)
            .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
          console.log(`  memory/ daily files    → ${dailyFiles.length} found`);
        } else {
          console.log(`  memory/                → not found`);
        }
        engine.close();
        return;
      }

      const report = await engine.migrateFromOpenClaw(opts.from, {
        dryRun: opts.dryRun,
      });

      if (opts.dryRun) {
        console.log(`Dry run — would import ${report.imported} entries from ${opts.from}`);
        for (const entry of report.entries) {
          console.log(`  [${entry.type}] ${entry.domain} — ${entry.sourceFile}`);
        }
      } else {
        console.log(`Migrated ${report.imported} entries from ${opts.from}`);
        const semantic = report.entries.filter((e) => e.type === "semantic").length;
        const episodic = report.entries.filter((e) => e.type === "episodic").length;
        if (semantic > 0) console.log(`  ${semantic} semantic  (MEMORY.md)`);
        if (episodic > 0) console.log(`  ${episodic} episodic  (memory/)`);
      }
      engine.close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

// neuroclaw ingest
program
  .command("ingest <path>")
  .description("Ingest a markdown file into NeuroClaw vault")
  .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
  .option("--agent <id>", "Agent ID")
  .option("--type <type>", "Memory type: semantic, procedural, episodic")
  .option("--domain <domain>", "Domain tag")
  .option("--dry-run", "Preview without writing", false)
  .option("--recursive", "Ingest all .md files in directory recursively", false)
  .action(async (filePath, opts) => {
    try {
      const engine = new NeuroclawEngine(opts.configDir, opts.agent);
      await engine.init();

      const fs2 = await import("node:fs");
      const path2 = await import("node:path");

      const targets: string[] = [];
      if (opts.recursive && fs2.statSync(filePath).isDirectory()) {
        const walk = (dir: string) => {
          for (const f of fs2.readdirSync(dir)) {
            const full = path2.join(dir, f);
            if (fs2.statSync(full).isDirectory()) walk(full);
            else if (f.endsWith(".md")) targets.push(full);
          }
        };
        walk(filePath);
      } else {
        targets.push(filePath);
      }

      let totalImported = 0;
      for (const target of targets) {
        const result = await engine.ingestFile(target, {
          type: opts.type as "semantic" | "procedural" | "episodic" | undefined,
          domain: opts.domain,
          dryRun: opts.dryRun,
        });
        totalImported += result.entries.length;
        if (opts.dryRun) {
          for (const e of result.entries) {
            console.log(`  [dry-run] ${e.type}/${e.domain} — ${path2.basename(target)}`);
          }
        }
      }

      if (opts.dryRun) {
        console.log(`Would import ${totalImported} entries.`);
      } else {
        console.log(`Ingested ${totalImported} entries.`);
      }
      engine.close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });
```

- [ ] **Step 4: Run full test suite**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests pass. TypeScript build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/src/index.ts \
        packages/core/src/engine.ts \
        packages/core/src/cli.ts
git commit -m "feat: add migrateFromOpenClaw and ingestFile engine facades + CLI commands"
```

---

## Task 8: Integration Test

**Files:**
- Create: `packages/core/src/__tests__/migration-integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/core/src/__tests__/migration-integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("Phase 3 Integration: Migration → Search → Dream", () => {
  let tmpDir: string;
  let configDir: string;
  let openclawDir: string;
  let engine: NeuroclawEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3-integration-"));
    configDir = path.join(tmpDir, "config");
    openclawDir = path.join(tmpDir, "openclaw-project");

    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(openclawDir, { recursive: true });
    fs.mkdirSync(path.join(openclawDir, "memory"), { recursive: true });

    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: test-agent\n  store_path: ${tmpDir}/store\n`
    );

    // Create OpenClaw source files
    fs.writeFileSync(
      path.join(openclawDir, "MEMORY.md"),
      [
        "## TypeScript Preferences",
        "",
        "Use strict mode. Prefer explicit types over inference for public APIs.",
        "",
        "## Testing Strategy",
        "",
        "Write tests before implementation. Use Vitest for unit tests.",
      ].join("\n")
    );

    fs.writeFileSync(
      path.join(openclawDir, "memory", "2026-03-01.md"),
      "Worked on auth module today. Fixed a CORS issue with preflight requests."
    );

    engine = new NeuroclawEngine(configDir);
    await engine.init();
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("migrates MEMORY.md and daily files, then finds them via search", async () => {
    const report = await engine.migrateFromOpenClaw(openclawDir);

    // 2 semantic (MEMORY.md H2 sections) + 1 episodic (daily file)
    expect(report.imported).toBe(3);

    const semanticEntries = report.entries.filter((e) => e.type === "semantic");
    const episodicEntries = report.entries.filter((e) => e.type === "episodic");
    expect(semanticEntries).toHaveLength(2);
    expect(episodicEntries).toHaveLength(1);

    // Should be searchable via FTS
    const tsResults = engine.search("strict mode TypeScript");
    expect(tsResults.length).toBeGreaterThanOrEqual(1);
    expect(tsResults[0].citationLabel).toMatch(/MEMORY\.md/);

    const testResults = engine.search("Vitest unit tests");
    expect(testResults.length).toBeGreaterThanOrEqual(1);
  });

  it("dry-run reports entries without importing", async () => {
    const report = await engine.migrateFromOpenClaw(openclawDir, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.imported).toBe(3);

    // Nothing actually written — search finds nothing
    const results = engine.search("TypeScript strict mode");
    expect(results).toHaveLength(0);
  });

  it("migration-tagged entries survive the dream cycle (Tier 3 protection)", async () => {
    await engine.migrateFromOpenClaw(openclawDir);

    // Capture an episode to trigger dream cycle
    await engine.captureEpisode({
      sessionId: "sess-1",
      project: "test",
      interactionText: "TypeScript strict mode caught a type error",
      summary: "TS strict helped",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    const report = await engine.executeDream();
    expect(report.archived).toBe(0); // migration entries protected

    // Migrated entries still searchable
    const results = engine.search("TypeScript strict mode");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("ingests an arbitrary markdown file via ingestFile", async () => {
    const docPath = path.join(tmpDir, "api-conventions.md");
    fs.writeFileSync(
      docPath,
      "## REST Conventions\n\nUse nouns for resource names. Plural always.\n"
    );

    const result = await engine.ingestFile(docPath, {
      type: "semantic",
      domain: "api",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].domain).toBe("api");

    const searchResults = engine.search("REST resource names");
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
  });

  it("citation fields are populated on migrated search results", async () => {
    await engine.migrateFromOpenClaw(openclawDir);

    const results = engine.search("TypeScript strict mode");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const result = results[0];
    expect(result.sourceFile).toBe("MEMORY.md");
    expect(result.domain).toBe("typescript-preferences");
    expect(result.createdAt).toBeDefined();
    expect(result.citationLabel).toContain("MEMORY.md");
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test --filter=@neuroclaw/core 2>&1 | grep -A10 "migration-integration\|Phase 3 Integration"`

Expected: All 5 integration tests pass.

- [ ] **Step 3: Run full test suite**

Run: `cd /c/Users/gabri/Documents/Codes/neural-hive && npx turbo test`

Expected: All tests across all 6 packages pass. No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/__tests__/migration-integration.test.ts
git commit -m "test: add Phase 3 integration test (migrate → search → dream)"
```

---

## Summary

| Task | Description | Key Output |
|------|-------------|------------|
| 1 | Data model extensions | `tags` on `SemanticRecord`, citation fields on `RetrievedMemory`, schema migration |
| 2 | SQLite GSEM methods | `incrementEdgeWeight`, `getStaleEdges`, `updateEdgeWeight` |
| 3 | Ingester | H2 splitting, vault write, DB insert, FTS index |
| 4 | Migrator | MEMORY.md → semantic, memory/*.md → episodic |
| 5 | GSEM + citations in retrieval | Edge weight updates on traversal, citation label on results |
| 6 | Forgetting safety nets | Tier 2 merge-before-drop, Tier 3 tag/domain protection, GSEM edge decay |
| 7 | Engine facades + CLI | `migrateFromOpenClaw`, `ingestFile`, `neuroclaw migrate`, `neuroclaw ingest` |
| 8 | Integration test | Full migrate → search → dream → protect end-to-end |
