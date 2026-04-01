# NeuroClaw

A model-agnostic, neuroscience-grounded self-improvement architecture for AI agents. NeuroClaw gives agents persistent memory, a self-model, and a governed dream cycle — so they actually get better over time instead of starting fresh every session.

## What it does

Most AI agents forget everything between sessions. NeuroClaw solves this with three interconnected systems:

- **Memory** — a markdown vault backed by SQLite + FTS5. Episodes, semantic knowledge, procedural patterns, and a working-memory file that's always in context.
- **Dream cycle** — after sessions, the agent consolidates episodic traces into durable semantic memory via a CLS-inspired (Complementary Learning Systems) replay mechanism. New knowledge is integrated gradually, preventing catastrophic forgetting.
- **Self-model** — a governed identity layer with capability tracking, behavioral hypotheses, and outcome-driven evolution. The agent can update its own beliefs about what it knows and how it works — within configurable safety boundaries.

## Packages

```
packages/
├── @neuroclaw/config         # Layered YAML config (base → platform → user → agent)
├── @neuroclaw/memory         # Vault, SQLite/FTS5, working memory, importance scoring, retrieval
├── @neuroclaw/governance     # Mode enforcement, audit trail, security scanner, invariants
├── @neuroclaw/core           # NeuroclawEngine orchestrator + CLI
├── adapter-openclaw          # OpenClaw platform adapter stub
└── adapter-claude-code       # Claude Code platform adapter stub
```

## Getting started

```bash
npm install
npm run build
npm test
```

Run the CLI (after build):

```bash
node packages/core/bin/neuroclaw.js --help

# Initialize
node packages/core/bin/neuroclaw.js init

# Show config
node packages/core/bin/neuroclaw.js config show

# Search memory
node packages/core/bin/neuroclaw.js search "authentication patterns"

# Status
node packages/core/bin/neuroclaw.js status
```

## Tech stack

- **TypeScript 5.x** + Node 20+
- **Turborepo** monorepo
- **Vitest** for tests
- **better-sqlite3** for SQLite + FTS5
- **js-yaml** for config
- **zod** for config validation
- **commander** for CLI

## Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| 1 — Foundation | ✅ Done | Monorepo, config, memory vault, governance, core engine + CLI, adapter stubs |
| 2 — CLS Memory | 🔜 Next | Episodic capture, dream cycle, interleaved replay, knowledge graph, forgetting curves |
| 3 — Self-Model | ⬜ Planned | Structured identity, capability tracking, behavioral hypotheses, governed evolution |
| 4 — Polish | ⬜ Planned | Health dashboard, cross-instance export/import, performance benchmarking |

## Why NeuroClaw is different

Several projects have tackled AI agent memory before. NeuroClaw builds on all of them and advances past each one's key limitation:

### self-improving (ivangdavila)

| | |
|---|---|
| **Strengths** | Correction logging, manual promotion heuristics (the 3x rule) |
| **Weakness** | Flat importance scoring based purely on repetition count — no signal for emotional salience or session significance |
| **NeuroClaw** | Valence-weighted consolidation: emotional salience (frustration, surprise, satisfaction) modulates what gets remembered and how strongly |
| **Why it matters** | One session where the agent was corrected is more valuable than ten routine ones. Counting repetitions misses this entirely |

### auto-dream (LeoYeAI)

| | |
|---|---|
| **Strengths** | File-based 5-layer memory architecture, scheduled dream consolidation |
| **Weakness** | Linear forgetting via age thresholds, no replay mechanism — new knowledge can silently overwrite old |
| **NeuroClaw** | CLS-inspired interleaved replay: during dream cycles, new episodes are replayed against the existing semantic store before being committed |
| **Why it matters** | Catastrophic forgetting is a real failure mode. The brain solves it with hippocampal replay during sleep — NeuroClaw applies the same principle |

### EvoClaw (slhleosun)

| | |
|---|---|
| **Strengths** | Structured identity evolution via heartbeat, SOUL.md |
| **Weakness** | No feedback loop — self-model mutations aren't tested against whether they actually improved outcomes |
| **NeuroClaw** | Outcome-grounded evolution: capability and identity changes are treated as hypotheses, tested against downstream task performance, and rolled back on regression |
| **Why it matters** | Evolution without verification is just drift. NeuroClaw only keeps changes that demonstrably help |

### Honcho (Plastic Labs)

| | |
|---|---|
| **Strengths** | Cloud-native memory reasoning, fine-tuned peer representation models |
| **Weakness** | SaaS dependency, opaque internals, representations aren't directly inspectable or editable |
| **NeuroClaw** | Local-first by default: all memory lives on your machine as readable markdown files. Optional Honcho sync available for users who want cloud-backed reasoning on top |
| **Why it matters** | Your agent's memory shouldn't live on someone else's server. Local-first means you own it, can audit it, version it, and export it |

## Benefits for Claude Code and OpenClaw users

**If you use Claude Code:**
- Your agent remembers your project's conventions, patterns, and preferences across sessions — without you repeating them every time
- Corrections you give ("don't do X", "always use Y") get consolidated into semantic memory and surface automatically in future sessions
- The working memory file (`working.md`) is always injected into context, giving your agent a persistent scratchpad that survives conversation resets
- All memory is stored locally in your `.claude/` directory — readable, editable, version-controllable

**If you use OpenClaw:**
- Full integration with AGENTS.md, SOUL.md, and HEARTBEAT.md platform primitives
- The dream cycle runs between sessions to distill episodic traces into durable knowledge — your agent's skill at your specific workflows compounds over time
- Governed evolution means the agent can update its own self-model, but only within boundaries you configure — no silent personality drift
- Knowledge graph linking between memory entries enables associative retrieval ("what connects the auth system to the API layer?") that keyword search can't do

## Architecture

Memory is stored in two complementary formats:

- **Markdown vault** — human-readable, LLM-native. Working memory, episodes, semantic knowledge, procedural patterns, dream logs.
- **SQLite index** — structured metadata, FTS5 full-text search, relations graph, importance scores.

Retrieval uses query classification to route between FTS5 text search (fast, keyword-based) and graph-walk (associative, relation-following — Phase 2).

Governance runs in one of three modes: `supervised` (all writes audited), `autonomous` (agent can write freely within invariants), or `locked` (read-only). A pre-write security scanner blocks sensitive content (API keys, PII patterns) before anything reaches the vault.
