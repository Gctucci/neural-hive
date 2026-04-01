# NeuroClaw: Self-Improving Agent Architecture

## Design Specification — v2.0 (2026-03-31)

---

## 1. Executive Summary

NeuroClaw is a model-agnostic self-improvement engine for LLM coding agents. It targets OpenClaw and Claude Code through a single TypeScript core with thin platform adapters. The core thesis: **treat memory as a learning problem, not a storage problem** — track what works, verify it's retrievable, evolve based on evidence, know your own limitations.

### What makes this different

| Existing Approach | Limitation | NeuroClaw Advance |
|---|---|---|
| **self-improving** (ivangdavila) | "Seen 3x → promote." No outcome tracking, no verification. | Hypotheses tested against actual outcomes, with rollback on regression. |
| **auto-dream** (LeoYeAI) | Summarize and store. Memories created but never verified retrievable. | Probe-QA verification after every consolidation — dead memories are caught and fixed. |
| **EvoClaw** (slhleosun) | Soul mutations happen but nobody checks if they helped. | Evidence-grounded evolution: mutations tracked, measured, rolled back if performance drops. |
| **All three** | Pure markdown, no structured search, no security scanning, OpenClaw-only. | SQLite + FTS5 + knowledge graph retrieval. Pre-write security scanning. Cross-platform (OpenClaw + Claude Code). |

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platform strategy | Single core + thin adapters | 95% of logic is platform-agnostic |
| Implementation language | TypeScript/Node | Native to both target platforms, no extra runtime |
| Architecture | Modular monorepo | Clean subsystem boundaries, independently testable |
| Multi-agent | Isolated + shared-knowledge from start | Core requirement; hive-mind deferred |
| Memory cadence | Adaptive | Starts cold-only, learns when hot-path refinement is worth the cost |
| Retrieval strategy | Query-dependent | FTS5 for simple lookups, graph-walk for associative queries |
| Self-improvement mechanism | Evidence-grounded | Hypotheses tracked against outcomes, not repetition counts |
| Configuration | Layered config + first-run wizard | base → platform → user → agent overrides |

### Research Grounding

| Paper | Key Contribution |
|---|---|
| MemMA (arXiv 2603.18718, Mar 2026) | Backward-path probe-QA verification for consolidated memories |
| GSEM (arXiv 2603.22096, Mar 2026) | Continuous graph edge-weight refinement on retrieval |
| HippoRAG 2 (arXiv 2502.14802, Feb 2025) | Graph-walk + vector hybrid outperforms pure embedding search |
| HARMONIC/OntoAgent (arXiv 2603.26730, Mar 2026) | LLMs don't reliably self-assess — explicit capability tracking needed |
| AutoAgent (arXiv 2603.09716, Mar 2026) | Skill crystallization from repeated successful patterns |
| FadeMem (arXiv 2601.18642, Jan 2026) | Adaptive decay with merge-before-drop improves retrieval |
| Memory for Autonomous LLM Agents (arXiv 2603.07670, Mar 2026) | Write-manage-read loop; memory > model scaling |
| A-MEM (arXiv 2502.12110, Feb 2025) | Zettelkasten-inspired linking; agent-driven organization |
| Complementary Learning Systems (O'Reilly et al., 2014) | Episodic → semantic consolidation with confirm/contradict/novel checks |

---

## 2. Architecture Overview

### 2.1 Monorepo Structure

```
neuroclaw/
├── packages/
│   ├── @neuroclaw/memory          # Vault + SQLite + FTS5 + graph retrieval
│   ├── @neuroclaw/consolidation   # Dream cycle: collect, consolidate, verify
│   ├── @neuroclaw/self-model      # Identity, capabilities, hypotheses, evolution
│   ├── @neuroclaw/governance      # Modes, audit trail, security scanner
│   ├── @neuroclaw/config          # Layered config system + setup wizard
│   ├── @neuroclaw/core            # Orchestrator + CLI
│   ├── @neuroclaw/adapter-openclaw
│   └── @neuroclaw/adapter-claude-code
├── config/
│   ├── base.yaml
│   ├── platform.yaml
│   ├── user.yaml
│   └── agents/
├── docs/
└── package.json                   # Turborepo/Nx monorepo root
```

### 2.2 Core Loop

```
User interaction
    │
    ▼
┌─────────────────────────────────────────┐
│  PERCEIVE                                │
│  ├─ Load working memory (always)         │
│  ├─ Load capability map (passive signal) │
│  ├─ Retrieve relevant memories:          │
│  │   ├─ FTS5/BM25 for simple lookups    │
│  │   └─ Graph-walk for associative      │
│  └─ Inject into context with source     │
│      citations                           │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  ACT                                     │
│  Agent processes + responds              │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  RECORD                                  │
│  ├─ Episodic trace (what happened)       │
│  ├─ Correction detection (LLM judgment)  │
│  ├─ Outcome signal (success/failure)     │
│  ├─ Update working memory                │
│  └─ Queue for dream cycle                │
└──────────────────────────────────────────┘

                ⏰ Scheduled
┌──────────────────────────────────────────┐
│  DREAM CYCLE                              │
│  1. Collect pending episodes              │
│  2. Consolidate: confirm/contradict/novel │
│  3. Verify: probe-QA on new entries       │
│  4. Evolve: capabilities + hypotheses     │
│  5. Report: daily digest                  │
└──────────────────────────────────────────┘
```

### 2.3 Source Citation

When the agent uses a retrieved memory, it cites the source transparently: "Based on what I learned in our session on April 3rd..." or "According to a pattern I've seen across 4 sessions..." This is injected into context alongside the memory content and the agent is instructed to reference it. Builds trust and allows the user to catch stale or incorrect memories.

---

## 3. Governance Model

### 3.1 Three Modes

**Autonomous** — agent runs freely, everything logged but nothing blocks on approval.

**Supervised** — agent captures and consolidates freely, but self-model changes (identity, capabilities, hypotheses) are presented as diffs and await approval.

**Gated** — maximum control. Semantic consolidation and self-model changes both require approval.

### 3.2 Operation Control Matrix

| Operation | Autonomous | Supervised | Gated |
|---|---|---|---|
| Episodic capture | Auto | Auto | Auto |
| Working memory updates | Auto | Auto | Auto |
| Correction detection | Auto | Auto | Auto |
| Semantic consolidation | Auto | Auto (diffed) | Propose + approve |
| Procedural memory updates | Auto | Auto (diffed) | Propose + approve |
| Self-model mutation | Auto (logged) | Propose + approve | Propose + approve |
| Hypothesis promotion/demotion | Auto (logged) | Propose + approve | Propose + approve |
| Config changes | Propose + approve | Propose + approve | Propose + approve |
| Graph edge weight updates | Auto | Auto | Auto |
| Knowledge graph pruning | Auto (logged) | Auto (diffed) | Propose + approve |

### 3.3 Invariant Rules (Hardcoded)

1. Agent can never escalate its own governance level
2. CORE identity sections are immutable unless user explicitly requests
3. All mutations logged to audit trail with timestamps and evidence chains
4. User can export or wipe all data at any time
5. No credentials, health data, or third-party PII stored (enforced by security scanner)
6. Episodic traces are never deleted (append-only, immutable)
7. Self-model and affect log are always private in multi-agent setups
8. Config changes always require explicit approval

### 3.4 Governance Transitions

- **Escalating trust** (gated → supervised → autonomous): immediate
- **Reducing trust** (autonomous → supervised/gated): immediate, plus queues a review — agent surfaces "here's what I did while autonomous" for audit

### 3.5 Approval Format

```yaml
proposal:
  type: self-model-mutation
  component: capabilities.md
  change: "Add 'TypeScript monorepo architecture' as confirmed strength"
  evidence:
    - session-2026-04-01-abc: "Successfully designed package boundaries"
    - session-2026-04-03-def: "Resolved circular dependency without guidance"
  confidence: 0.82
  reversible: true
```

Rejections are logged as high-value learning signals — the agent learns what self-assessments the user disagrees with.

---

## 4. Memory Subsystem

### 4.1 Storage Architecture

**Markdown vault** — source of truth for content. Human-readable, LLM-native, git-friendly.

**SQLite index** — source of truth for structure and metadata. Enables structured queries, graph traversal, FTS5 search. Fully rebuildable from the vault.

```
neuroclaw/agents/{id}/
├── vault/
│   ├── working.md                  # Always loaded. ≤100 lines.
│   ├── episodic/
│   │   └── YYYY-MM-DD/
│   │       └── session-{id}.md     # What happened + outcome + corrections
│   ├── semantic/
│   │   ├── domains/*.md            # Domain knowledge generalizations
│   │   └── projects/*.md           # Project-specific patterns
│   ├── procedural/
│   │   └── *.md                    # "What worked" entries for recurring task types
│   ├── self-model/
│   │   ├── identity.md             # CORE + MUTABLE sections
│   │   ├── capabilities.md         # Strengths, weaknesses, unknown
│   │   ├── hypotheses.md           # Behavioral beliefs under test
│   │   └── evolution-log.md        # Append-only: timestamp, change, evidence, diff
│   ├── dreams/
│   │   └── YYYY-MM-DD-dream.md     # Dream log + daily digest
│   └── archive/                    # Gracefully decayed (never deleted)
│
├── governance/
│   ├── boundaries.md               # Security boundaries
│   ├── consent-log.md              # User consent decisions
│   └── audit-trail.md              # Every memory mutation, timestamped
│
└── index.db                        # SQLite with WAL mode
```

### 4.2 Memory Types

**Working memory** (`working.md`) — always in context. Capped at ~100 lines. Current project context, active preferences, recent corrections. Updated after every interaction.

**Episodic memory** (`episodic/`) — immutable, timestamped traces of interactions. Each session produces one episode: what happened, what went well/wrong, whether corrections occurred, outcome signal. These are the raw data that everything else is built from.

**Semantic memory** (`semantic/`) — distilled generalizations extracted from episodes during dream cycles. The agent's beliefs — revisable when new evidence contradicts them.

**Procedural memory** (`procedural/`) — "what worked" entries for recurring task types. Not parameterized YAML templates — plain markdown descriptions of successful approaches that the LLM can generalize from:

```markdown
# Creating REST API Endpoints

## Pattern (based on 7 successful sessions)

When creating a new API endpoint in this project:
1. Create route file at src/routes/{resource}.ts
2. Define handlers with input validation using zod
3. Add auth middleware for protected routes
4. Register route in src/routes/index.ts
5. Add integration tests at tests/routes/{resource}.test.ts

## Common mistakes I've made
- Forgot to register route → 404s (session-2026-04-02)
- Missing auth on sensitive endpoints (session-2026-04-05)
```

Crystallization: when the dream cycle notices the same task type succeeding 3+ times across different contexts, it creates a procedural entry capturing the invariant pattern.

**Archive** (`archive/`) — memories below retention threshold. Moved with summary and pointer to original. Can be revived if referenced. Never deleted.

### 4.3 SQLite Schema

```sql
episodes (
  id TEXT PRIMARY KEY,
  timestamp INTEGER,
  session_id TEXT,
  project TEXT,
  importance REAL,
  is_correction BOOLEAN,
  outcome_signal REAL,             -- -1.0 to 1.0 (failure to success)
  consolidation_status TEXT,       -- pending | consolidated | migrated | archived
  file_path TEXT,
  summary TEXT
)

semantic (
  id TEXT PRIMARY KEY,
  domain TEXT,
  created INTEGER,
  last_accessed INTEGER,
  importance REAL,
  ref_count INTEGER,
  confidence REAL,
  file_path TEXT,
  line_range TEXT
)

procedures (
  id TEXT PRIMARY KEY,
  name TEXT,
  task_type TEXT,
  success_count INTEGER,
  last_used INTEGER,
  file_path TEXT
)

relations (
  source_id TEXT,
  target_id TEXT,
  relation_type TEXT,              -- supports | contradicts | elaborates | requires
  weight REAL,                     -- refined on retrieval (GSEM pattern)
  created INTEGER,
  last_used INTEGER
)

chunks_fts VIRTUAL TABLE USING fts5(content, source_id, source_type)

hypotheses (
  id TEXT PRIMARY KEY,
  claim TEXT,
  evidence_for INTEGER,
  evidence_against INTEGER,
  status TEXT,                     -- tentative | confirmed | demoted | revoked | stale
  created INTEGER,
  last_tested INTEGER,
  outcome_score REAL
)
```

### 4.4 Retrieval Strategy (Query-Dependent)

Every retrieval request is classified before execution:

**Simple lookup** (most queries) → FTS5 + BM25 ranking. Direct keyword match. Fast.

**Associative query** (cross-domain, relational, or when text search returns poor results) → Personalized PageRank over the relations graph, combined with BM25 scores.

Default heuristic: if query length > 8 tokens AND contains relational terms ("related to", "similar to", "influenced by", "compared with", "connects to") OR references multiple domains → graph-walk. Otherwise → FTS5. Confidence threshold for graph-walk override: 0.6. This heuristic adapts over time.

Retrieved memories include source citations — file path, creation date, and evidence chain — injected into context so the agent can reference where knowledge came from.

### 4.5 Importance Scoring

```
importance = sigmoid(
    w_base × base_weight
  + w_recency × recency_factor
  + w_refs × log₂(ref_count + 1)
  + w_outcome × outcome_signal
  + w_correction × is_correction
)
```

`outcome_signal`: whether applying this memory led to success (+1) or failure (-1). `is_correction`: corrections get a flat importance boost — they're expensive lessons.

### 4.6 Forgetting (with Safety Nets)

```
retention = base_retention × e^(-t / (half_life × importance))
```

**Three-tier protection:**

**Tier 1: Unforgettable** — never enter the decay curve:
- Episodic traces (immutable source of truth)
- Anything with outcome_signal (positive or negative)
- User-confirmed entries
- Corrections
- Self-model entries
- Procedural entries with success_count >= 1

**Tier 2: Decay-eligible, merge-before-drop**:
- Semantic entries not accessed in decay_window days
- Before archiving: attempt to merge into a related semantic node
- If merge fails: move to archive with full content and summary

**Tier 3: Noise** — pruned from active retrieval only:
- Episodic details with no outcome signal, no corrections, no references, no access in decay_window days
- Still in the episodic vault — just removed from SQLite index

**Guarantee:** Nothing with demonstrated utility ever leaves active retrieval. Forgetting only targets noise.

---

## 5. Self-Model and Evolution

This is the core of self-improvement — the agent's explicit representation of what it is, what it can do, and what it believes.

### 5.1 Identity

`vault/self-model/identity.md` — two sections:

```markdown
<!-- CORE -->
I am a coding agent focused on helping my user write correct, maintainable software.
I am honest about what I don't know.
<!-- /CORE -->

<!-- MUTABLE -->
I lean toward explicit error handling rather than broad try-catch blocks.
When the user is exploring an idea, I ask one question at a time.
I've learned that this user prefers concise responses with no trailing summaries.
<!-- /MUTABLE -->
```

CORE is immutable unless the user explicitly requests changes. MUTABLE evolves through evidence-backed dream cycle proposals.

### 5.2 Capabilities

`vault/self-model/capabilities.md` — structured map built from evidence only:

```yaml
strengths:
  - domain: "TypeScript/Node architecture"
    confidence: 0.9
    evidence: ["session-2026-04-01-abc", "session-2026-04-05-def"]
    last_validated: "2026-04-05"

weaknesses:
  - domain: "CSS animations"
    confidence: 0.8
    evidence: ["session-2026-04-02-jkl"]

unknown:
  - domain: "Kubernetes networking"
    reason: "Never encountered in interactions"
```

Strengths require positive outcome signals. Weaknesses require correction patterns or negative outcomes. Unknown is everything else. The capability map is loaded into context as a passive signal — the agent naturally becomes more careful and retrieves more memories when working in weak areas.

### 5.3 Hypotheses

`vault/self-model/hypotheses.md` — tentative beliefs subject to revision:

```yaml
- id: "hyp-001"
  claim: "This user prefers single bundled PRs for refactors"
  status: tentative
  evidence_for: 2
  evidence_against: 0
  promotion_threshold: 3
```

**Lifecycle:**
- Observation → Tentative hypothesis
- Evidence accumulates FOR → Confirmed → Promoted to semantic memory (and optionally to MUTABLE identity)
- Evidence accumulates AGAINST → Demoted → Revised or revoked
- Demotion triggers when `evidence_against >= abs(demotion_threshold)` AND `evidence_against > evidence_for`
- No new evidence for `decay_window_days` (default: 60) → Flagged as `stale`, surfaced in daily digest for user review — not auto-demoted

### 5.4 Evolution (Dream Cycle Phase)

During each dream cycle:

1. **Hypothesis testing**: Review tentative hypotheses against new evidence from recent episodes. Promote, demote, or leave as-is.
2. **Capability update**: Scan recent episodes for outcome signals. Positive outcomes → increase confidence. Corrections → flag as weakness.
3. **Identity drift check**: Are MUTABLE traits still supported by recent evidence?
4. **Evolution proposal**: In supervised/gated mode, generate a diff for user approval.
5. **Evolution log**: Every change recorded with timestamp, evidence chain, previous value. Creates an inspectable, reversible timeline of the agent's growth.

---

## 6. Dream Cycle

### 6.1 Trigger Conditions

- **Scheduled**: Daily (configurable, default 3 AM). Multi-agent: staggered by 1 hour.
- **Activity-triggered**: When unconsolidated episodes exceed threshold (default: 20).
- **On-demand**: User triggers manually.
- **Idle-day**: If no new episodes, runs lightweight variant — Phase 1 (empty collection), Phase 4 (hypothesis review with existing data), Phase 5 (health report). Skips consolidation and verification. Surfaces one old memory as a "remember this?" prompt.

### 6.2 Five Phases

**Phase 1: Collection**

```sql
SELECT * FROM episodes WHERE consolidation_status = 'pending' ORDER BY importance DESC
```

Load full markdown narratives from vault.

**Phase 2: Consolidation**

For each pending episode, check against existing semantic knowledge:

- **Confirms existing knowledge?** → Strengthen: increment ref_count, update last_accessed, increase confidence.
- **Contradicts existing knowledge?** → Don't overwrite. Create a competing hypothesis. Log both. The contradiction itself is valuable — the user may have changed preferences, the project may have changed, or the generalization was too broad.
- **Genuinely novel?** → Create new semantic entry. Link to related entries via relations graph.
- **Repeated successful pattern?** → If same task type succeeds 3+ times across different contexts, crystallize as a procedural entry.

Write new entries to vault, index in SQLite, create/update knowledge graph edges. Run forgetting review: tier 2 merge-before-drop, tier 3 noise pruning.

**Phase 3: Verification (MemMA-Inspired)**

Backward-path probe-QA: for each newly consolidated entry, generate a synthetic question that should retrieve it:

```
Consolidated: "This project uses barrel exports in src/components/index.ts"
Probe: "How are components exported in this project?"
```

Run the probe through the retrieval system. If the consolidated entry isn't in the top-K results:
- Rewrite poorly worded entries
- Add FTS5-friendly aliases
- Create missing graph edges

Also run a coherence check: scan recently consolidated entries for contradictions. Flag as competing hypotheses if found.

**Phase 4: Self-Model Evolution**

As described in Section 5.4: test hypotheses, update capabilities, check identity drift, generate proposals, log changes.

**Phase 5: Health Report + Daily Digest**

Health metrics:

| Metric | What It Measures | Target |
|---|---|---|
| Freshness | % of semantic entries accessed in last 30 days | > 60% |
| Coverage | % of active domains updated in last 14 days | > 70% |
| Coherence | % of entries with no contradictions | > 90% |
| Efficiency | Semantic entries / episodic traces ratio | 1:5 to 1:10 |
| Groundedness | % of beliefs backed by outcome data | > 50% |
| Retrieval quality | % of probe-QA tests passing | > 85% |

Daily digest generated at configured detail level (compact / summary / full). Always generated, never suppressible. Delivered at next session start or file-only per config.

### 6.3 Daily Digest

**Mandatory** after every dream cycle, regardless of governance mode.

**Compact** — one-paragraph TL;DR.

**Summary** (default) — structured breakdown:
- Memory changes (added, updated, archived, with counts)
- Self-model changes (hypotheses promoted/demoted, capabilities updated)
- Health score breakdown
- Security scan results

**Full** — complete reasoning chains for each decision.

**Escalation** (overrides configured level):
- Security findings → always surfaced at next session
- Health score below threshold (default: 50) → escalated to summary + next session
- Any self-model change in autonomous mode → included in digest (not suppressible)

### 6.4 Multi-Agent Dream Coordination

**Isolated mode**: each agent dreams independently.

**Shared-knowledge mode**: two-tier:
1. Private dreams (staggered, per-agent): consolidate own episodes into private semantic store. Shared-relevant entries written to `shared/vault/_pending/agent-id/` (same format as semantic entries with `contributing_agent` frontmatter field).
2. Shared dream (after all private dreams): reviews pending contributions, resolves contradictions, runs probe-QA on shared entries, cleans up pending.

Schedule example (3 agents): 2 AM, 3 AM, 4 AM private; 5 AM shared.

---

## 7. Platform Adapters

### 7.1 Adapter Interface

```typescript
interface NeuroclawAdapter {
  onSessionStart(context: SessionContext): Promise<void>
  onSessionEnd(context: SessionContext): Promise<void>
  beforeAction(context: ActionContext): Promise<InjectedMemory>
  afterAction(context: ActionContext, result: ActionResult): Promise<void>
  scheduleDream(config: DreamSchedule): Promise<void>
  executeDream(): Promise<DreamReport>
  injectIntoPrompt(memories: RetrievedMemory[]): string
  detectPlatform(): PlatformInfo
  getDefaultConfig(): Partial<NeuroclawConfig>
}

// Key type definitions (full definitions in @neuroclaw/core/types.ts)
interface SessionContext {
  sessionId: string
  agentId: string
  platform: "openclaw" | "claude_code"
  workingDirectory: string
  projectName?: string
}

interface ActionContext extends SessionContext {
  messageHistory: Message[]
  loadedMemories: RetrievedMemory[]
}

interface RetrievedMemory {
  id: string
  type: "episodic" | "semantic" | "procedural"
  content: string
  importance: number
  relevanceScore: number
  source: string                   // File path in vault — used for citation
  created: number
  evidenceChain?: string[]         // For transparency
}

interface ActionResult {
  success: boolean
  toolUsed?: string
  outputSummary?: string
  isCorrection: boolean
}

interface DreamReport {
  timestamp: number
  episodesProcessed: number
  consolidated: number
  archived: number
  hypothesesUpdated: string[]
  capabilityChanges: string[]
  healthScore: number
  securityFindings: string[]
  digestPath: string
}

interface PlatformInfo {
  platform: "openclaw" | "claude_code"
  workspaceFiles: string[]
  nativeMemoryPath?: string
}
```

### 7.2 OpenClaw Adapter

| OpenClaw Primitive | NeuroClaw Usage |
|---|---|
| `AGENTS.md` | Context injection: working memory + retrieved memories with citations |
| `SOUL.md` | Bidirectional sync with vault/self-model/identity.md |
| `HEARTBEAT.md` | Dream cycle trigger + health report |
| Cron / Heartbeat | Dream cycle scheduling |
| Isolated sessions | Dream cycle runs in own session |
| Skill tools | neuroclaw CLI exposed as tool calls |
| Gateway | Multi-agent routing by agent ID |
| `memory/YYYY-MM-DD.md` | Native memory flush files ingested as supplementary episodic data |

**SOUL.md bidirectional sync:**
- Session start: if SOUL.md was edited by hand → import into identity.md
- Dream cycle evolution: if identity.md changed → update SOUL.md
- Conflict: manual edits take precedence (user intent > agent evolution)

**Base-soul inheritance** (multi-agent):
```
Identity resolution (most specific wins):
1. Agent SOUL.md MUTABLE
2. Shared SOUL-base.md MUTABLE
3. Agent SOUL.md CORE
4. Shared SOUL-base.md CORE
```

### 7.3 Claude Code Adapter

| Claude Code Primitive | NeuroClaw Usage |
|---|---|
| `CLAUDE.md` | Managed section for working memory + self-model summary |
| Hooks (pre/post tool use) | Episodic capture, correction detection |
| Session start hook | Load context, run retrieval |
| MCP Server | Expose NeuroClaw as tool provider |
| Scheduled triggers | Dream cycle scheduling |
| Skills / Slash commands | `/neuroclaw status`, `/neuroclaw dream`, `/neuroclaw recall` |
| Worktrees / Subagents | Multi-agent store mapping |
| `.claude/memory/` | Native memory files ingested during migration and ongoing |

**MCP Server tools:**

```
neuroclaw_search(query, scope?)      → Retrieve relevant memories with citations
neuroclaw_recall(topic)              → Deep associative recall (graph-walk)
neuroclaw_status()                   → Health metrics summary
neuroclaw_dream(mode?)               → Trigger dream cycle
neuroclaw_log_correction(text)       → Explicitly log a correction
neuroclaw_propose_hypothesis(claim)  → Register behavioral hypothesis
neuroclaw_capability(domain, signal) → Update capability map
```

**CLAUDE.md managed section:**

```markdown
<!-- NEUROCLAW:START - Auto-managed, do not edit manually -->
## Self-Model Summary
...
## Active Context
...
## Current Hypotheses Under Test
...
<!-- NEUROCLAW:END -->
```

Regenerated on each session start and after each dream cycle. Deletable by user — regenerated from vault.

### 7.4 Cross-Platform Portability

Both adapters share the same core engine, vault format, SQLite schema, config system, and dream cycle logic. A vault created on OpenClaw works on Claude Code and vice versa.

---

## 8. Migration

### 8.1 Sources

**Claude Code:**
- `CLAUDE.md` → semantic entries (project instructions, conventions)
- `.claude/memory/` → semantic + self-model (typed frontmatter: user, feedback, project, reference)

**OpenClaw:**
- `AGENTS.md` → semantic (behavioral rules)
- `SOUL.md` → self-model identity (CORE/MUTABLE)
- `HEARTBEAT.md` → config reference
- `memory/YYYY-MM-DD.md` → episodic traces
- `self-improving/` → working/semantic/archive + corrections (high-importance episodic)
- `auto-dream/` → episodic, semantic, procedural, knowledge graph, dream logs
- `EvoClaw/` → self-model, evolution timeline, governance state

### 8.2 Migration Phases

**Phase 1: Inventory** — scan for all known sources, report findings, ask for confirmation.

**Phase 2: Classification** — each source item classified into NeuroClaw memory types. Corrections tagged with high importance. All entries tagged with `source: migration` and original file path. Status: `consolidation_status: migrated`.

**Phase 3: Import** — write to vault, index in SQLite, create graph edges.

**Phase 4: Verification** — probe-QA on sample of migrated entries, report retrieval quality.

**Phase 5: Post-migration dream** — lightweight dream cycle reviewing migrated entries for contradictions, missing edges, stale references.

Source files are never modified or deleted.

### 8.3 Custom Markdown Ingestion

General-purpose ingestion for any markdown file:

```bash
neuroclaw ingest ./docs/api-conventions.md --type semantic --domain "api"
neuroclaw ingest ./docs/ --recursive --auto-classify
neuroclaw ingest ./runbook.md --type procedural --name "deployment-runbook"
neuroclaw ingest ./notes/*.md --dry-run
neuroclaw ingest ./docs/wiki.md --watch
```

| Flag | Effect |
|---|---|
| `--type` | Force: semantic, procedural, episodic, reference |
| `--domain` | Tag with domain |
| `--project` | Tag with project |
| `--auto-classify` | LLM-based classification: reads content, decides type and domain |
| `--recursive` | Walk directory tree |
| `--dry-run` | Preview without writing |
| `--watch` | Re-ingest on file modification (2-second debounce; existing entry updated in-place; graph edges preserved) |
| `--link-to` | Create relation edge to existing entry |

The agent itself can ingest files discovered during work. In autonomous mode: silently. In supervised/gated: proposes first.

### 8.4 Ongoing Platform Sync

Adapters continuously detect changes to platform-native files:
- CLAUDE.md edited by hand → import new/changed content on next session start
- SOUL.md updated outside NeuroClaw → sync on session start
- New `memory/YYYY-MM-DD.md` files → ingest as supplementary episodic data

---

## 9. Multi-Agent Architecture

### 9.1 Mode 1: Isolated (Default)

Each agent fully independent. No shared state.

```
Agent A                      Agent B
~/neuroclaw/agents/a/        ~/neuroclaw/agents/b/
├── vault/                   ├── vault/
├── index.db                 ├── index.db
└── config/agent.yaml        └── config/agent.yaml
```

### 9.2 Mode 2: Shared Knowledge

Agents share semantic knowledge and procedural memory. Private: episodic, self-model, working memory.

```
~/neuroclaw/
├── shared/
│   ├── vault/
│   │   ├── semantic/               # All agents read/write
│   │   ├── procedural/
│   │   ├── _pending/{agent-id}/    # Staging for contributions
│   │   └── archive/
│   └── shared-index.db             # SQLite WAL mode
├── agents/
│   ├── research/                    # Private store
│   │   ├── vault/ (working, episodic, self-model, archive)
│   │   └── index.db
│   └── code/                        # Private store
│       ├── vault/
│       └── index.db
└── config/
```

### 9.3 Visibility Matrix

| Memory Layer | Isolated | Shared Knowledge | Hive Mind (future) |
|---|---|---|---|
| Working memory | Private | Private | Private |
| Episodic | Private | Private | Shared (tagged) |
| Semantic | Private | **Shared** | Shared |
| Procedural | Private | **Shared** | Shared |
| Self-model | Private | Private | **Private (always)** |

Self-model is **always private** — hardcoded invariant.

### 9.4 Concurrency

- **SQLite**: WAL mode — multiple readers, single writer with automatic retry
- **Markdown vault**: File-level advisory locks via `@neuroclaw/memory`
- **Write policy**: Agents append to shared vault. Modifications only during shared dream cycle.

### 9.5 Conflict Resolution

When agents contribute contradictory knowledge:

1. **User decision** — explicit preference wins immediately
2. **Outcome evidence** — positive outcome beats negative
3. **Recency** — more recent evidence preferred
4. **Coexistence** — both live as competing hypotheses

### 9.6 Inter-Agent Queries

```typescript
const results = await core.search({
  query: "authentication patterns",
  scope: "shared",
  domain: "security"
})
```

Private data never returned in cross-agent queries — enforced at engine level.

---

## 10. Security

### 10.1 Sensitive Data Protection

Every write to the vault or SQLite passes through a pre-write scanner.

**Always blocked (hardcoded, not configurable):**

| Pattern | Examples |
|---|---|
| API keys | `sk-`, `AKIA`, `ghp_`, `xoxb-`, bearer tokens |
| Credentials | `password=`, `secret=`, connection strings |
| Private keys | `-----BEGIN RSA PRIVATE KEY-----`, PEM blocks |
| Environment variables | `.env` contents, `export SECRET=` |

**Configurable:**

| Pattern | Default Action |
|---|---|
| PII (emails, phone numbers) | Redact → `[REDACTED:type]` |
| Custom patterns (user-defined regex) | Block or redact per config |

**Vault audit**: periodic full scan during dream cycle. Catches patterns added after content was written.

```bash
neuroclaw audit --security          # Full vault scan
neuroclaw audit --security --fix    # Scan and auto-redact
```

**Invariants:**
- API keys and private keys always blocked. No config override.
- Scanner cannot be disabled.
- `--skip-security` does not exist.
- Audit trail never contains sensitive data.

---

## 11. Configuration System

### 11.1 Config Hierarchy

```
config/
├── base.yaml              # Ships with NeuroClaw. Sensible defaults.
├── platform.yaml          # Auto-generated per platform.
├── user.yaml              # User global preferences.
└── agents/
    └── {id}.yaml          # Agent-specific overrides.
```

Merge order: `base.yaml → platform.yaml → user.yaml → agents/{id}.yaml`. Each layer only declares overrides.

### 11.2 Base Config

```yaml
agent:
  id: "default"
  role: "general"
  store_path: "~/neuroclaw/agents/${agent.id}/"

governance:
  mode: "supervised"

memory:
  working_memory_max_lines: 100
  episodic:
    capture: true
    max_context_lines: 500
  procedural:
    crystallization_threshold: 3
  forgetting:
    enabled: true
    decay_window_days: 30
    min_importance_to_keep: 0.2
    merge_before_drop: true
    unforgettable_categories:
      - "corrections"
      - "user_confirmed"
      - "has_outcome"
      - "procedural"
      - "self_model"
    archive_policy: "keep_forever"

retrieval:
  strategy: "query_dependent"
  text:
    engine: "fts5_bm25"
  graph:
    enabled: true
    algorithm: "pagerank"
    trigger: "auto"
  embeddings:
    enabled: false
    provider: null
    model: "nomic-embed-text"
    hybrid_weight:
      vector: 0.7
      text: 0.3

consolidation:
  dream_cycle:
    schedule: "daily"
    default_hour: 3
    activity_trigger_threshold: 20
    idle_behavior: "recall"
  verification:
    probe_qa: true
    probe_sample_size: 10
    coherence_check: true

self_model:
  hypothesis:
    promotion_threshold: 3
    demotion_threshold: -2
    decay_window_days: 60
  citation:
    enabled: true

multi_agent:
  mode: "isolated"
  shared:
    store_path: "~/neuroclaw/shared/"
    layers: ["semantic", "procedural"]
    write_policy: "append_only"
    dream_stagger_hours: 1
  soul:
    inheritance: false
    base_soul_path: null

security:
  sensitive_data: "block"
  pii_handling: "redact"
  custom_patterns: []
  vault_audit: true

notifications:
  daily_digest: "summary"
  delivery: "next_session"
  escalation:
    health_threshold: 50
    security_findings: "always"

migration:
  auto_detect: true
  sources: []
```

### 11.3 First-Run Wizard

Interactive setup when no `user.yaml` exists:
1. Confirm detected platform
2. Choose governance mode
3. Choose multi-agent mode
4. Detect and offer migration of existing data
5. Choose notification level

Generates `user.yaml` with explicit choices only.

### 11.4 Self-Improvable Config

The agent can propose config changes based on experience. Config changes **always** require user approval — hardcoded invariant, even in autonomous mode.

---

## 12. CLI Reference

```bash
# Setup
neuroclaw init                           # First-run wizard
neuroclaw config [show|set|diff|validate|reset|export]

# Memory operations
neuroclaw search <query> [--scope shared|private|all] [--domain <d>]
neuroclaw recall <topic>                 # Deep associative recall (graph-walk)
neuroclaw status                         # Health metrics summary

# Dream cycle
neuroclaw dream [--full|--lite]          # Trigger dream cycle
neuroclaw dream --schedule               # Show next scheduled dream

# Ingestion
neuroclaw ingest <path> [--type <t>] [--domain <d>] [--project <p>]
                        [--auto-classify] [--recursive] [--dry-run]
                        [--watch] [--link-to <id>]

# Migration
neuroclaw migrate [--scan|--dry-run|--run|--verify]
                  [--from claude-code|openclaw|auto-dream|self-improving|evoclaw]

# Index management
neuroclaw index rebuild                  # Rebuild SQLite from vault
neuroclaw index export                   # Export to JSON
neuroclaw index stats                    # Index size, entry counts

# Security
neuroclaw audit --security [--fix]       # Vault security scan

# Multi-agent
neuroclaw agents list                    # List configured agents
neuroclaw agents query --agent <id> --domain <d> --topic <t>
  # Queries a specific agent's shared semantic store by domain/topic.
  # Episodic, self-model data never returned.

# Diagnostics
neuroclaw doctor                         # Full system health check
neuroclaw export --all                   # Timestamped zip: vault/ + index.db + config
neuroclaw export --all --agent <id>      # Export specific agent
neuroclaw wipe --confirm                 # Delete vault/ + index.db (config preserved)
neuroclaw wipe --confirm --agent <id>    # Wipe specific agent only
```

---

## 13. Open Design Questions

1. **Adaptive memory budgets**: v1 uses fixed limits (100 lines working, 500 lines episodic context). Adaptive budgets based on model context window deferred to v2.
2. **Dream cycle self-tuning**: v1 uses fixed daily schedule. Self-tuning frequency deferred to v2.
3. **Hive-mind mode**: Architecture supports it. Needs adversarial integrity protections before implementation.
4. **Evaluation protocol**: MemoryArena (arXiv 2602.16313) as the evaluation framework for measuring self-improvement over time.
5. **Embedding benchmarking**: Default is nomic-embed-text via Ollama. Comparison against alternatives in Phase 6.

---

## 14. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- Monorepo scaffolding (Turborepo/Nx)
- `@neuroclaw/config`: layered config, base.yaml, first-run wizard
- `@neuroclaw/memory`: vault read/write, SQLite schema, FTS5 search, working memory
- `@neuroclaw/governance`: mode enforcement, audit trail, security scanner
- Basic adapter stubs
- `neuroclaw init`, `neuroclaw config`, `neuroclaw search`

### Phase 2: Consolidation + Self-Model (Weeks 3-4)
- `@neuroclaw/consolidation`: collect, consolidate (confirm/contradict/novel), verify (probe-QA)
- `@neuroclaw/self-model`: identity (CORE/MUTABLE), capabilities, hypotheses
- Full episodic capture with correction detection and outcome signals
- Procedural memory crystallization
- Dream cycle with all 5 phases
- Daily digest generation
- Knowledge graph: relations table, edge creation, graph-walk retrieval

### Phase 3: Migration + Ingestion (Weeks 5-6)
- Migration system: inventory, classification, import for both platforms
- Custom markdown ingestion CLI
- Forgetting with three-tier safety nets
- Graph edge refinement on retrieval (GSEM)
- Source citation injection

### Phase 4: Multi-Agent (Weeks 7-8)
- Shared-knowledge mode: shared vault, shared-index.db, WAL concurrency
- Base-soul inheritance for OpenClaw
- Staggered + shared dream cycles
- Conflict resolution protocol
- Inter-agent queries
- `neuroclaw agents` CLI commands

### Phase 5: Platform Adapters (Weeks 9-10)
- Full OpenClaw adapter: AGENTS.md, SOUL.md, HEARTBEAT.md, native memory ingestion
- Full Claude Code adapter: CLAUDE.md section, hooks, MCP server, slash commands
- Ongoing platform sync (detect changes to native files)
- Cross-platform vault portability testing

### Phase 6: Polish (Weeks 11-12)
- Optional embedding integration (Ollama, cloud providers)
- Query-dependent retrieval tuning
- Health dashboard
- Performance benchmarking
- Documentation
- MemoryArena evaluation
