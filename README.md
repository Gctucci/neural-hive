# NeuroClaw

**Your AI agent forgets everything when the session ends. NeuroClaw fixes that.**

NeuroClaw gives [Claude](https://claude.ai) and [OpenClaw](https://github.com/openclaw/openclaw) agents persistent memory, a self-model, and a dream cycle — so they compound knowledge over time instead of starting from scratch every session.

> Not a file system. Not a note-taker. A neuroscience-grounded memory architecture that learns the way you do.

---

## The problem

Every session, your agent loses context. You re-explain your preferences. You repeat past corrections. It forgets what worked and what didn't. The more you use it, the more you wish it remembered — but it never does.

This isn't a model limitation. It's an architecture gap. And it's fixable.

---

## What NeuroClaw does

Three systems work together to make your agent genuinely smarter over time:

**Memory** — a markdown vault backed by SQLite + FTS5. Sessions are captured as episodes. Knowledge is distilled into semantic entries by domain. Procedures become reusable patterns. A `working.md` file is always in context — your agent's live scratchpad across sessions.

**Dream cycle** — after each session, NeuroClaw consolidates episodic traces into durable semantic memory. Inspired by how the brain uses sleep to integrate new knowledge without overwriting old. New things don't replace old things — they're woven in.

**Self-model** — a governed identity layer. Your agent tracks what it knows, what it can do, and what it believes about your preferences. It can evolve these beliefs when outcomes prove them wrong — within safety boundaries you control.

---

## Why it's different

NeuroClaw builds on four influential projects and advances past each one's key limitation:

### [self-improving](https://clawhub.ai/ivangdavila/self-improving) (ivangdavila)

| | |
|---|---|
| **Strengths** | Correction logging, promotion heuristics |
| **Weakness** | Flat importance scoring — just repetition count, no emotional salience |
| **NeuroClaw** | Valence-weighted consolidation: a frustrating session matters more than ten routine ones |
| **Why it matters** | Memory that can't tell the difference between routine and significant will always feel dumb |

### [auto-dream](https://github.com/LeoYeAI/openclaw-auto-dream) (LeoYeAI)

| | |
|---|---|
| **Strengths** | Layered memory architecture, scheduled dream consolidation |
| **Weakness** | Linear forgetting via age thresholds — no replay, vulnerable to catastrophic forgetting |
| **NeuroClaw** | CLS-inspired interleaved replay: new episodes are tested against existing knowledge before being committed |
| **Why it matters** | Without replay, new knowledge can silently overwrite old. The brain solved this with sleep — NeuroClaw does the same |

### [EvoClaw](https://github.com/slhleosun/EvoClaw) (slhleosun)

| | |
|---|---|
| **Strengths** | Structured identity evolution via heartbeat |
| **Weakness** | No feedback loop — mutations aren't tested against whether they actually helped |
| **NeuroClaw** | Outcome-grounded evolution: identity changes are hypotheses, tested, and rolled back on regression |
| **Why it matters** | Evolution without verification is drift. NeuroClaw only keeps changes that demonstrably improve performance |

### [Hermes Agent](https://github.com/nousresearch/hermes-agent) (Nous Research)

| | |
|---|---|
| **Strengths** | Full learning loop, autonomous skill creation from experience, FTS5 session search, multi-platform, model-agnostic |
| **Weakness** | Memory is accumulated but never distilled — no consolidation mechanism, no principled episodic/semantic/procedural separation, no structured self-model |
| **NeuroClaw** | Principled memory architecture with dream-cycle consolidation, CLS replay, and a governed self-model with hypothesis-tested evolution |
| **Why it matters** | Accumulating memories indefinitely creates noise. Without consolidation, the signal-to-noise ratio degrades over time — and the agent gets slower, not smarter |

---

## Who it's for

**Claude Code users** — NeuroClaw persists your project conventions, past corrections, and preferences across sessions. Your agent stops asking what it already knows. Working memory is always in context. Everything lives in your `.claude/` directory — readable, editable, version-controllable.

**OpenClaw users** — Full integration with AGENTS.md, SOUL.md, and HEARTBEAT.md. The dream cycle compounds your agent's skill at your specific workflows over time. Governed evolution means the agent updates its own self-model within boundaries you set — no silent personality drift.

---

## Packages

```
packages/
├── @neuroclaw/config         # Layered YAML config (base → platform → user → agent)
├── @neuroclaw/memory         # Vault, SQLite/FTS5, working memory, importance scoring, retrieval
├── @neuroclaw/governance     # Mode enforcement, audit trail, security scanner, invariants
├── @neuroclaw/core           # NeuroclawEngine orchestrator + CLI
├── adapter-openclaw          # OpenClaw platform adapter
└── adapter-claude-code       # Claude Code platform adapter
```

---

## Getting started

```bash
npm install
npm run build
npm test
```

```bash
# Initialize NeuroClaw for your agent
node packages/core/bin/neuroclaw.js init

# Search your agent's memory
node packages/core/bin/neuroclaw.js search "authentication patterns"

# Show current config
node packages/core/bin/neuroclaw.js config show

# Health check
node packages/core/bin/neuroclaw.js status
```

---

## Roadmap

| Phase | Status | What's coming |
|-------|--------|---------------|
| 1 — Foundation | ✅ Done | Monorepo, config, memory vault, governance, core engine + CLI, adapter stubs |
| 2 — CLS Memory | 🔜 Next | Episodic capture, dream cycle, interleaved replay, knowledge graph, forgetting curves |
| 3 — Self-Model | ⬜ Planned | Structured identity, capability tracking, behavioral hypotheses, governed evolution |
| 4 — Polish | ⬜ Planned | Health dashboard, cross-instance export/import, benchmarks, docs |

---

## Tech stack

TypeScript 5.x · Node 20+ · Turborepo · Vitest · better-sqlite3 · js-yaml · zod · commander
