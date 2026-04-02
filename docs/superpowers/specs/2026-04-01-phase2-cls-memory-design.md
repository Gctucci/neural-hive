# Phase 2: CLS Memory — Design Spec

**Date:** 2026-04-01
**Approach:** Layered by data flow (Approach C)

---

## Overview

Phase 2 implements the Complementary Learning Systems (CLS) memory architecture for NeuroClaw. It adds valence-scored episodic capture, a five-phase dream cycle with interleaved replay, knowledge graph linking, forgetting curves with affect modulation, and graph-walk retrieval.

Phase 2 also fixes the circular dependency between `core`, `memory`, and `governance` packages as a prerequisite.

---

## 1. Circular Dependency Fix

### Problem

`@neuroclaw/core` defines shared types in `types.ts`, but `memory` and `governance` import from `core`, while `core` imports from both — creating a cycle that breaks `turbo build`.

### Solution

Move all shared types/interfaces from `packages/core/src/types.ts` into `packages/config/src/types.ts`. The `config` package has zero internal deps and is the natural leaf node.

**Dependency graph after fix:**

```
config (types + schema + loader)
  ^         ^           ^
memory    governance    adapters
  ^         ^
  core (engine, dream, CLI)
    ^
  adapters
```

**Steps:**

1. Move all type/interface/union definitions from `core/src/types.ts` to `config/src/types.ts`
2. Update `config/src/index.ts` to re-export the new types
3. `core/src/types.ts` becomes a re-export: `export * from "@neuroclaw/config"` (temporary backwards compat)
4. Update imports in `memory/src/sqlite.ts`: `@neuroclaw/core` to `@neuroclaw/config`
5. Update imports in `governance/src/invariants.ts` and `governance/src/mode.ts`: `@neuroclaw/core` to `@neuroclaw/config`
6. Remove `@neuroclaw/core` from `memory/package.json` and `governance/package.json` dependencies
7. Add `@neuroclaw/config` to `governance/package.json` dependencies (memory already has it)

---

## 2. Extended Data Model

### Modified Types

**EpisodeRecord** — add affect dimensions:

```typescript
interface EpisodeRecord {
  // ...existing fields (id, timestamp, session_id, project, importance,
  //    is_correction, outcome_signal, consolidation_status, file_path, summary)
  valence: number;         // -1.0 (negative) to +1.0 (positive)
  arousal: number;         // 0.0 (calm) to 1.0 (intense)
  context_snippet: string; // raw text that triggered the valence score
}
```

**SemanticRecord** — add forgetting curve fields:

```typescript
interface SemanticRecord {
  // ...existing fields (id, domain, created, last_accessed, importance,
  //    ref_count, confidence, file_path, line_range)
  half_life: number;          // days, modulated by valence of source episodes
  retention: number;          // 0.0-1.0, recomputed each dream cycle
  source_episode_ids: string; // comma-separated episode IDs that contributed
}
```

**RelationRecord** — add provenance:

```typescript
interface RelationRecord {
  // ...existing fields (source_id, target_id, relation_type, weight,
  //    created, last_used)
  provenance: "rule" | "llm"; // how the link was discovered
  confidence: number;         // 0.0-1.0, LLM links start lower
}
```

### DB Schema Migrations

Applied in `NeuroclawDB.create()` as additive-only `ALTER TABLE` statements (existing Phase 1 databases stay compatible):

- `episodes`: add `valence REAL DEFAULT 0.0`, `arousal REAL DEFAULT 0.0`, `context_snippet TEXT DEFAULT ''`
- `semantic`: add `half_life REAL DEFAULT 30.0`, `retention REAL DEFAULT 1.0`, `source_episode_ids TEXT DEFAULT ''`
- `relations`: add `provenance TEXT DEFAULT 'rule'`, `confidence REAL DEFAULT 1.0`

---

## 3. Valence Scorer

**Location:** `packages/memory/src/valence.ts`

**Interface:**

```typescript
interface ValenceResult {
  valence: number;   // -1.0 to +1.0
  arousal: number;   // 0.0 to 1.0
  source: "local" | "llm";
}

interface ValenceScorer {
  score(text: string): Promise<ValenceResult>;
}
```

### Local Scorer (default)

Three layers combined:

1. **VADER base** — `vader-sentiment` npm package gives a compound score (-1 to +1), maps directly to valence. Pure JS, no network calls.

2. **Arousal heuristic** — computed from text intensity signals:
   - Exclamation/question mark density
   - ALL CAPS word ratio
   - Intensity adverbs ("extremely", "absolutely", "terrible", "amazing")
   - Emoji density
   - Normalized to 0.0-1.0

3. **Domain pattern overrides** — agent-specific markers that amplify or override VADER:
   - Correction patterns ("I told you", "no that's wrong", "try again") -> force valence negative, boost arousal
   - Praise patterns ("perfect", "exactly", "great job") -> force valence positive
   - Surprise patterns ("interesting", "didn't expect", "oh wow") -> boost arousal regardless of valence
   - Domain patterns take precedence over VADER when matched

### LLM Scorer (optional)

Sends a short prompt with the interaction text, asks for `{valence, arousal}` as JSON. Configured via:

```yaml
memory:
  valence:
    scorer: "local"  # or "llm"
    llm_provider: null  # adapter-specific, resolved at runtime
```

### New Dependency

`vader-sentiment` added to `@neuroclaw/memory` package.json.

---

## 4. Episodic Capture

**Location:** `packages/memory/src/capture.ts`

**Class:**

```typescript
class EpisodeCapture {
  constructor(
    db: NeuroclawDB,
    vault: Vault,
    scorer: ValenceScorer,
    config: NeuroclawConfig
  )

  capture(input: CaptureInput): Promise<EpisodeRecord>
}

interface CaptureInput {
  sessionId: string;
  project: string | null;
  interactionText: string;  // raw exchange text to score
  summary: string;          // what happened
  isCorrection: boolean;
  outcomeSignal: number;    // -1 to +1
}
```

### Capture Pipeline

1. Score valence/arousal via the `ValenceScorer`
2. Compute importance using `computeImportance()` — extended with valence magnitude as a factor (new weight `W_VALENCE = 0.9`)
3. Write episode markdown to `vault/episodic/{id}.md` with frontmatter metadata
4. Insert record into DB via `db.insertEpisode()`
5. Index content into FTS via `db.indexContent()`
6. Return completed `EpisodeRecord`

### Episode File Format

```markdown
---
id: ep-1712000000-abc1
session: sess-xyz
valence: -0.7
arousal: 0.8
importance: 0.82
is_correction: true
---

User asked to refactor the auth middleware. I initially moved the
session check after the CORS handler, which broke preflight requests.
User corrected: "CORS must run before any auth logic."
```

### ImportanceInput Extension

Add optional `valenceMagnitude: number` to `ImportanceInput`. New weight constant `W_VALENCE = 0.9` — high |valence| events get boosted (amygdala modulation).

### Integration Point

Adapters (`adapter-claude-code`, `adapter-openclaw`) call `EpisodeCapture.capture()` in their `afterAction()` hook.

---

## 5. Dream Cycle

**Location:** `packages/core/src/dream.ts`

**Class:**

```typescript
class DreamCycle {
  constructor(
    db: NeuroclawDB,
    vault: Vault,
    config: NeuroclawConfig,
    gate: GovernanceGate,
    audit: AuditTrail,
    scorer: ValenceScorer
  )

  run(): Promise<DreamReport>
}
```

### Phase 1 — Collection

- Query `db.getPendingEpisodes()` for unconsolidated episodes
- If none and `idle_behavior = "recall"`: surface a random old semantic entry as reminder (write to working memory)
- If none and `idle_behavior = "skip"`: return early with minimal report
- Sort by importance (valence-weighted, highest first)

### Phase 2 — Replay (CLS-inspired)

For each pending episode, replay against the semantic store:

- **FTS search** the episode summary against semantic entries
- A match is "strong" when FTS rank (absolute value) >= 3.0 (at least 3 term occurrences). This threshold is a starting point and may be tuned based on observed consolidation quality.
- Strong match + confirmation -> increment `ref_count`, update `last_accessed`, add `supports` relation
- Strong match + contradiction -> add `contradicts` relation, create hypothesis for review
- No match (or all matches below threshold) -> create new semantic entry by distilling episode into generalization, write to `vault/semantic/domains/{domain}.md`
- Repeated workflow detected -> check procedures table, increment `success_count` or create new procedure

Rule-based relation discovery runs here: `provenance = "rule"`, `confidence = 1.0`.

### Phase 3 — Consolidation

- Mark replayed episodes as `consolidation_status = "consolidated"`
- Merge semantic entries with high overlap (same domain, `elaborates` relation, high confidence)
- Apply forgetting curves:
  ```
  retention = base_retention * e^(-t / (half_life * importance))
  ```
  Where `half_life` is modulated by average |valence| of source episodes
- Entries with `retention < min_importance_to_keep` -> move to `vault/archive/`, status = `"archived"`
- Entries in `unforgettable_categories` are exempt

### Phase 4 — Self-Model Evolution

- Query hypotheses with sufficient evidence
- `evidence_for >= promotion_threshold` -> status = `"confirmed"`, append to `self-model/identity.md` MUTABLE section
- `evidence_against <= demotion_threshold` -> status = `"demoted"`
- Governance: if `supervised` or `gated`, write proposed changes to `dreams/pending-evolution.md` instead of applying directly
- Log all changes to `self-model/evolution-log.md` with evidence chain

### Phase 5 — Health Report

Six metrics:

| Metric | Calculation |
|--------|-------------|
| **Freshness** | % of semantic entries accessed in last 30 days |
| **Coverage** | % of known domains updated in last 14 days |
| **Coherence** | Average relation count per semantic entry |
| **Efficiency** | Semantic count / episode count |
| **Groundedness** | % of confirmed hypotheses with positive outcome scores |
| **Affective balance** | Mean valence of episodes from last 7 days |

Write report to `vault/dreams/dream-{timestamp}.md`, return `DreamReport`.

### Engine Integration

`NeuroclawEngine` gains:
- `executeDream(): Promise<DreamReport>` — delegates to `DreamCycle.run()`
- `scheduleDream()` — stores schedule config (actual cron is platform-specific, handled by adapters)

---

## 6. Graph-Walk Retrieval

Replaces the stub in `RetrievalEngine.graphWalkSearch()`.

### Algorithm

1. **Seed selection** — FTS search the query, take top 3 semantic entries as seeds
2. **Walk** — from each seed, traverse via `relations` table up to 2 hops deep, collecting connected entries with relation types and weights
3. **Score** — each walked entry:
   ```
   score = seed_relevance * relation_weight * depth_decay
   ```
   Where `depth_decay = 0.7^depth` (1 hop = 0.7, 2 hops = 0.49)
4. **Deduplicate & rank** — same entry from multiple seeds takes highest score. Return top `limit` results.

### New DB Methods

- `getRelationsTo(targetId): RelationRecord[]` — bidirectional walks
- `getSemanticByDomain(domain): SemanticRecord[]` — domain-scoped walks

### Config

Uses existing `retrieval.graph` config:
- `enabled: true` (default)
- `algorithm: "pagerank"` — reserved for future; Phase 2 uses depth-decay walk
- `trigger: "auto"` — `classifyQuery()` decides text vs graph (already implemented)

No changes to `classifyQuery()`.

---

## Implementation Order

1. Fix circular dependency (move types to config)
2. Extend data model (types + DB migrations)
3. Build valence scorer (VADER + heuristics + pluggable LLM)
4. Build episodic capture pipeline
5. Build dream cycle (phases 1-5)
6. Build graph-walk retrieval

Each step builds on real (not stubbed) subsystems from the previous step.

---

## New Dependencies

| Package | Added To | Purpose |
|---------|----------|---------|
| `vader-sentiment` | `@neuroclaw/memory` | Local valence scoring |

## New Files

| File | Package | Purpose |
|------|---------|---------|
| `config/src/types.ts` | config | Shared types (moved from core) |
| `memory/src/valence.ts` | memory | ValenceScorer interface + local/LLM implementations |
| `memory/src/capture.ts` | memory | EpisodeCapture pipeline |
| `core/src/dream.ts` | core | DreamCycle orchestrator |

## Modified Files

| File | Change |
|------|--------|
| `config/src/index.ts` | Re-export types |
| `config/src/schema.ts` | Add valence config section |
| `core/src/types.ts` | Re-export from config (backwards compat) |
| `core/src/engine.ts` | Add dream cycle integration |
| `core/src/index.ts` | Export DreamCycle |
| `memory/src/sqlite.ts` | Schema migrations, new query methods |
| `memory/src/importance.ts` | Add valenceMagnitude to ImportanceInput |
| `memory/src/retrieval.ts` | Implement graphWalkSearch |
| `memory/src/index.ts` | Export new modules |
| `memory/package.json` | Add vader-sentiment, remove @neuroclaw/core |
| `governance/package.json` | Replace @neuroclaw/core with @neuroclaw/config |
| `governance/src/invariants.ts` | Update import path |
| `governance/src/mode.ts` | Update import path |
