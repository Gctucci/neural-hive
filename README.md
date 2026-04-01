# NeuroClaw

**Your AI agent forgets everything when the session ends. NeuroClaw fixes that — and makes it genuinely improve over time.**

NeuroClaw gives [Claude](https://claude.ai) and [OpenClaw](https://github.com/openclaw/openclaw) agents persistent memory, a self-model, and an autonomous improvement loop — grounded in neuroscience, affective computing, and psychology research — so they get measurably better with every session instead of starting from scratch.

> Not a file system. Not a note-taker. A self-improving memory architecture built the way brains actually work.

---

## The problem

Every session, your agent loses context. You re-explain your preferences. You repeat past corrections. It forgets what worked and what didn't. The more you use it, the more you wish it remembered — but it never does.

This isn't a model limitation. It's an architecture gap. And it's fixable.

---

## How NeuroClaw makes your agent self-improve

Most memory systems just store things. NeuroClaw applies three decades of cognitive science research to make stored experience actually useful:

**From neuroscience — Complementary Learning Systems (CLS):** The brain uses two memory systems: a fast hippocampal system that captures raw episodes, and a slow cortical system that distills them into durable knowledge. NeuroClaw mirrors this exactly. Episodes are captured immediately after sessions, then replayed against the semantic store during dream cycles — the same interleaving mechanism that prevents catastrophic forgetting in biological memory.

**From affective computing — Valence-arousal modulation:** Not all experiences are equally important. NeuroClaw scores every memory trace for emotional salience — frustration, surprise, satisfaction — and uses this signal to prioritize consolidation. A session where something went wrong gets remembered more strongly than ten routine ones. This is grounded in amygdala-modulated memory formation: emotionally significant events are encoded differently than neutral ones.

**From psychology — Hypothesis-driven self-modeling:** Your agent maintains a structured self-model: what it knows, what it can do, and what it believes about your preferences. When outcomes contradict a belief, the belief is updated — not blindly, but through a governed hypothesis-testing cycle with rollback on regression. The agent evolves its own mental model of itself and you, continuously, based on evidence.

The result: an agent that doesn't just remember the past — it learns from it. Every session makes the next one better.

---

## The three systems

**Memory** — a markdown vault backed by SQLite + FTS5. Sessions are captured as episodes. Knowledge is distilled into semantic entries by domain. Procedures become reusable patterns. A `working.md` file is always in context — your agent's live scratchpad across sessions.

**Dream cycle** — after each session, NeuroClaw consolidates episodic traces into durable semantic memory via CLS-inspired interleaved replay. New knowledge is woven into the existing store, not appended on top of it.

**Self-model** — a governed identity layer with capability tracking, behavioral hypotheses, and outcome-driven evolution. Your agent can update its own beliefs — within safety boundaries you control.

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
