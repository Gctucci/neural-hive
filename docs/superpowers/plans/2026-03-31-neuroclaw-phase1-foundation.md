# NeuroClaw Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the NeuroClaw monorepo and deliver working config, memory (vault + SQLite + FTS5), governance (modes + audit + security scanner), core CLI, and adapter stubs — enough to run `neuroclaw init`, `neuroclaw config show`, and `neuroclaw search`.

**Architecture:** TypeScript modular monorepo with Turborepo. Each package has a clear responsibility and exports a typed public API. Packages communicate through interfaces defined in `@neuroclaw/core`. SQLite via `better-sqlite3`. YAML via `js-yaml`. CLI via `commander`.

**Tech Stack:** TypeScript 5.x, Node 20+, Turborepo, Vitest, better-sqlite3, js-yaml, commander, zod (config validation)

**Spec reference:** `docs/superpowers/specs/2026-03-31-neuroclaw-design.md` — Sections 2, 3, 4, 10, 11, 12

**Note:** This is Phase 1 of 6. Phases 2-6 will each get their own plan as the previous phase completes.

---

## File Structure

```
neuroclaw/
├── package.json                          # Monorepo root (Turborepo)
├── turbo.json                            # Turborepo pipeline config
├── tsconfig.base.json                    # Shared TS config
├── vitest.workspace.ts                   # Shared test config
├── packages/
│   ├── config/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API exports
│   │   │   ├── schema.ts                 # Zod schema for config validation
│   │   │   ├── loader.ts                 # Layered config loading + merge
│   │   │   ├── wizard.ts                 # First-run interactive wizard
│   │   │   └── defaults.ts               # base.yaml content as typed default
│   │   ├── src/__tests__/
│   │   │   ├── schema.test.ts
│   │   │   ├── loader.test.ts
│   │   │   └── wizard.test.ts
│   │   └── base.yaml                     # Ships with package
│   │
│   ├── memory/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API exports
│   │   │   ├── vault.ts                  # Markdown vault read/write/list
│   │   │   ├── sqlite.ts                 # SQLite connection + schema + migrations
│   │   │   ├── indexer.ts                # Index vault files into SQLite + FTS5
│   │   │   ├── retrieval.ts              # FTS5/BM25 search + query classification
│   │   │   ├── working-memory.ts         # Working memory manager (read/update/prune)
│   │   │   ├── importance.ts             # Importance scoring formula
│   │   │   └── types.ts                  # Memory-specific types
│   │   └── src/__tests__/
│   │       ├── vault.test.ts
│   │       ├── sqlite.test.ts
│   │       ├── indexer.test.ts
│   │       ├── retrieval.test.ts
│   │       ├── working-memory.test.ts
│   │       └── importance.test.ts
│   │
│   ├── governance/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API exports
│   │   │   ├── mode.ts                   # Governance mode enforcement
│   │   │   ├── audit.ts                  # Audit trail logger
│   │   │   ├── scanner.ts                # Pre-write security scanner
│   │   │   └── invariants.ts             # Hardcoded invariant checks
│   │   └── src/__tests__/
│   │       ├── mode.test.ts
│   │       ├── audit.test.ts
│   │       ├── scanner.test.ts
│   │       └── invariants.test.ts
│   │
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API exports
│   │   │   ├── types.ts                  # Shared types (adapter interface, etc.)
│   │   │   ├── engine.ts                 # NeuroclawEngine: wires subsystems
│   │   │   └── cli.ts                    # CLI entry point (commander)
│   │   ├── src/__tests__/
│   │   │   └── engine.test.ts
│   │   └── bin/
│   │       └── neuroclaw.ts              # Executable entry point
│   │
│   ├── adapter-openclaw/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Stub: implements NeuroclawAdapter
│   │       └── detect.ts                 # Platform detection logic
│   │
│   └── adapter-claude-code/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # Stub: implements NeuroclawAdapter
│           └── detect.ts                 # Platform detection logic
```

---

## Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json`, `turbo.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `.gitignore` (update)

- [ ] **Step 1: Initialize root package.json**

```json
{
  "name": "neuroclaw",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

Write this to `package.json` in the repo root.

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: Create vitest.workspace.ts**

```typescript
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/*/vitest.config.ts"]);
```

- [ ] **Step 5: Update .gitignore**

Append to the existing `.gitignore`:

```
# NeuroClaw build artifacts
node_modules/
dist/
*.tsbuildinfo

# SQLite databases (user data, not committed)
*.db
*.db-wal
*.db-shm

# User config (generated, not committed)
config/user.yaml
config/platform.yaml
config/agents/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 7: Commit**

```bash
git add package.json turbo.json tsconfig.base.json vitest.workspace.ts .gitignore
git commit -m "feat: scaffold monorepo with Turborepo, TypeScript, Vitest"
```

---

## Task 2: Scaffold All Package Shells

**Files:**
- Create: `packages/{config,memory,governance,core,adapter-openclaw,adapter-claude-code}/package.json`
- Create: `packages/{config,memory,governance,core,adapter-openclaw,adapter-claude-code}/tsconfig.json`
- Create: `packages/{config,memory,governance,core,adapter-openclaw,adapter-claude-code}/vitest.config.ts`
- Create: `packages/{config,memory,governance,core,adapter-openclaw,adapter-claude-code}/src/index.ts`

- [ ] **Step 1: Create packages/config/package.json**

```json
{
  "name": "@neuroclaw/config",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create packages/memory/package.json**

```json
{
  "name": "@neuroclaw/memory",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.0",
    "@neuroclaw/config": "0.1.0",
    "@neuroclaw/governance": "0.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 3: Create packages/governance/package.json**

```json
{
  "name": "@neuroclaw/governance",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 4: Create packages/core/package.json**

```json
{
  "name": "@neuroclaw/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "neuroclaw": "bin/neuroclaw.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@neuroclaw/config": "0.1.0",
    "@neuroclaw/memory": "0.1.0",
    "@neuroclaw/governance": "0.1.0",
    "commander": "^13.1.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 5: Create packages/adapter-openclaw/package.json**

```json
{
  "name": "@neuroclaw/adapter-openclaw",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@neuroclaw/core": "0.1.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 6: Create packages/adapter-claude-code/package.json**

```json
{
  "name": "@neuroclaw/adapter-claude-code",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@neuroclaw/core": "0.1.0"
  },
  "devDependencies": {
    "vitest": "^3.1.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 7: Create tsconfig.json for each package**

Each package gets the same tsconfig (adjust if needed):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

Write this to: `packages/config/tsconfig.json`, `packages/memory/tsconfig.json`, `packages/governance/tsconfig.json`, `packages/core/tsconfig.json`, `packages/adapter-openclaw/tsconfig.json`, `packages/adapter-claude-code/tsconfig.json`.

- [ ] **Step 8: Create vitest.config.ts for each package**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

Write to each package directory.

- [ ] **Step 9: Create placeholder src/index.ts for each package**

```typescript
// @neuroclaw/<package-name>
export {};
```

Write to each `packages/*/src/index.ts`.

- [ ] **Step 10: Install all dependencies**

Run: `npm install`

- [ ] **Step 11: Verify build**

Run: `npm run build`

Expected: all packages compile with no errors. Each produces a `dist/` directory.

- [ ] **Step 12: Commit**

```bash
git add packages/
git commit -m "feat: scaffold all package shells with dependencies"
```

---

## Task 3: Shared Types (@neuroclaw/core/types.ts)

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the types test**

Create `packages/core/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  NeuroclawAdapter,
  SessionContext,
  ActionContext,
  RetrievedMemory,
  ActionResult,
  DreamReport,
  PlatformInfo,
  GovernanceMode,
  MemoryType,
  ConsolidationStatus,
  RelationType,
  HypothesisStatus,
} from "../types";

describe("types", () => {
  it("GovernanceMode has exactly three values", () => {
    const modes: GovernanceMode[] = ["autonomous", "supervised", "gated"];
    expect(modes).toHaveLength(3);
  });

  it("MemoryType has exactly four values", () => {
    const types: MemoryType[] = ["episodic", "semantic", "procedural", "working"];
    expect(types).toHaveLength(4);
  });

  it("ConsolidationStatus has exactly four values", () => {
    const statuses: ConsolidationStatus[] = [
      "pending",
      "consolidated",
      "migrated",
      "archived",
    ];
    expect(statuses).toHaveLength(4);
  });

  it("RelationType has exactly four values", () => {
    const types: RelationType[] = [
      "supports",
      "contradicts",
      "elaborates",
      "requires",
    ];
    expect(types).toHaveLength(4);
  });

  it("HypothesisStatus has exactly five values", () => {
    const statuses: HypothesisStatus[] = [
      "tentative",
      "confirmed",
      "demoted",
      "revoked",
      "stale",
    ];
    expect(statuses).toHaveLength(5);
  });

  it("RetrievedMemory has required fields", () => {
    const memory: RetrievedMemory = {
      id: "test-1",
      type: "semantic",
      content: "Test content",
      importance: 0.8,
      relevanceScore: 0.9,
      source: "vault/semantic/domains/test.md",
      created: Date.now(),
    };
    expect(memory.id).toBe("test-1");
    expect(memory.type).toBe("semantic");
  });

  it("ActionResult tracks corrections", () => {
    const result: ActionResult = {
      success: true,
      isCorrection: false,
    };
    expect(result.isCorrection).toBe(false);

    const correction: ActionResult = {
      success: false,
      isCorrection: true,
      toolUsed: "Edit",
      outputSummary: "User corrected the approach",
    };
    expect(correction.isCorrection).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run`

Expected: FAIL — types module doesn't exist.

- [ ] **Step 3: Write the types**

Create `packages/core/src/types.ts`:

```typescript
// --- Enums as union types ---

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

// --- Core data types ---

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

export interface ActionResult {
  success: boolean;
  toolUsed?: string;
  outputSummary?: string;
  isCorrection: boolean;
}

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

export interface InjectedMemory {
  workingMemory: string;
  retrievedMemories: RetrievedMemory[];
  capabilityContext?: string;
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

export interface DreamSchedule {
  frequency: "daily" | "on_demand";
  hour: number;
  staggerOffset?: number;
}

export interface PlatformInfo {
  platform: "openclaw" | "claude_code";
  workspaceFiles: string[];
  nativeMemoryPath?: string;
}

// --- Adapter interface ---

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

// --- Episode record (maps to SQLite row) ---

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

// --- Semantic record ---

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

// --- Procedure record ---

export interface ProcedureRecord {
  id: string;
  name: string;
  task_type: string;
  success_count: number;
  last_used: number;
  file_path: string;
}

// --- Relation record ---

export interface RelationRecord {
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  weight: number;
  created: number;
  last_used: number;
}

// --- Hypothesis record ---

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
```

- [ ] **Step 4: Export types from index.ts**

Update `packages/core/src/index.ts`:

```typescript
export * from "./types";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add shared type definitions for all subsystems"
```

---

## Task 4: Config Schema + Defaults (@neuroclaw/config)

**Files:**
- Create: `packages/config/src/schema.ts`
- Create: `packages/config/src/defaults.ts`
- Create: `packages/config/src/__tests__/schema.test.ts`

- [ ] **Step 1: Write the schema test**

Create `packages/config/src/__tests__/schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { NeuroclawConfigSchema, type NeuroclawConfig } from "../schema";
import { DEFAULT_CONFIG } from "../defaults";

describe("NeuroclawConfigSchema", () => {
  it("validates the default config", () => {
    const result = NeuroclawConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  it("rejects invalid governance mode", () => {
    const bad = { ...DEFAULT_CONFIG, governance: { mode: "yolo" } };
    const result = NeuroclawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts partial config (everything optional except agent.id)", () => {
    const minimal = { agent: { id: "test" } };
    const result = NeuroclawConfigSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing fields", () => {
    const minimal = { agent: { id: "test" } };
    const result = NeuroclawConfigSchema.parse(minimal);
    expect(result.governance.mode).toBe("supervised");
    expect(result.memory.working_memory_max_lines).toBe(100);
    expect(result.security.sensitive_data).toBe("block");
  });

  it("rejects negative working_memory_max_lines", () => {
    const bad = {
      agent: { id: "test" },
      memory: { working_memory_max_lines: -1 },
    };
    const result = NeuroclawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("validates forgetting unforgettable_categories is string array", () => {
    const config = {
      agent: { id: "test" },
      memory: {
        forgetting: {
          unforgettable_categories: ["corrections", "user_confirmed"],
        },
      },
    };
    const result = NeuroclawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/config && npx vitest run`

Expected: FAIL — schema module doesn't exist.

- [ ] **Step 3: Write the schema**

Create `packages/config/src/schema.ts`:

```typescript
import { z } from "zod";

const AgentSchema = z.object({
  id: z.string(),
  role: z.string().default("general"),
  store_path: z.string().default("~/neuroclaw/agents/${agent.id}/"),
});

const GovernanceModeSchema = z.enum(["autonomous", "supervised", "gated"]);

const GovernanceSchema = z.object({
  mode: GovernanceModeSchema.default("supervised"),
});

const ForgettingSchema = z.object({
  enabled: z.boolean().default(true),
  decay_window_days: z.number().positive().default(30),
  min_importance_to_keep: z.number().min(0).max(1).default(0.2),
  merge_before_drop: z.boolean().default(true),
  unforgettable_categories: z
    .array(z.string())
    .default([
      "corrections",
      "user_confirmed",
      "has_outcome",
      "procedural",
      "self_model",
    ]),
  archive_policy: z.enum(["keep_forever"]).default("keep_forever"),
});

const EpisodicSchema = z.object({
  capture: z.boolean().default(true),
  max_context_lines: z.number().positive().default(500),
});

const ProceduralSchema = z.object({
  crystallization_threshold: z.number().positive().default(3),
});

const MemorySchema = z.object({
  working_memory_max_lines: z.number().positive().default(100),
  episodic: EpisodicSchema.default({}),
  procedural: ProceduralSchema.default({}),
  forgetting: ForgettingSchema.default({}),
});

const EmbeddingsSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.string().nullable().default(null),
  model: z.string().default("nomic-embed-text"),
  hybrid_weight: z
    .object({
      vector: z.number().default(0.7),
      text: z.number().default(0.3),
    })
    .default({}),
});

const GraphSchema = z.object({
  enabled: z.boolean().default(true),
  algorithm: z.enum(["pagerank"]).default("pagerank"),
  trigger: z.enum(["auto", "always", "never"]).default("auto"),
});

const RetrievalSchema = z.object({
  strategy: z
    .enum(["query_dependent", "text_only", "always_graph"])
    .default("query_dependent"),
  text: z
    .object({ engine: z.enum(["fts5_bm25"]).default("fts5_bm25") })
    .default({}),
  graph: GraphSchema.default({}),
  embeddings: EmbeddingsSchema.default({}),
});

const VerificationSchema = z.object({
  probe_qa: z.boolean().default(true),
  probe_sample_size: z.number().positive().default(10),
  coherence_check: z.boolean().default(true),
});

const DreamCycleSchema = z.object({
  schedule: z.enum(["daily", "on_demand"]).default("daily"),
  default_hour: z.number().min(0).max(23).default(3),
  activity_trigger_threshold: z.number().positive().default(20),
  idle_behavior: z.enum(["skip", "recall", "health_only"]).default("recall"),
});

const ConsolidationSchema = z.object({
  dream_cycle: DreamCycleSchema.default({}),
  verification: VerificationSchema.default({}),
});

const HypothesisSchema = z.object({
  promotion_threshold: z.number().positive().default(3),
  demotion_threshold: z.number().negative().default(-2),
  decay_window_days: z.number().positive().default(60),
});

const SelfModelSchema = z.object({
  hypothesis: HypothesisSchema.default({}),
  citation: z.object({ enabled: z.boolean().default(true) }).default({}),
});

const SharedSchema = z.object({
  store_path: z.string().default("~/neuroclaw/shared/"),
  layers: z.array(z.string()).default(["semantic", "procedural"]),
  write_policy: z.enum(["append_only"]).default("append_only"),
  dream_stagger_hours: z.number().positive().default(1),
});

const SoulSchema = z.object({
  inheritance: z.boolean().default(false),
  base_soul_path: z.string().nullable().default(null),
});

const MultiAgentSchema = z.object({
  mode: z
    .enum(["isolated", "shared_knowledge", "hive_mind"])
    .default("isolated"),
  shared: SharedSchema.default({}),
  soul: SoulSchema.default({}),
});

const CustomPatternSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  action: z.enum(["block", "redact"]),
});

const SecuritySchema = z.object({
  sensitive_data: z.enum(["block", "redact"]).default("block"),
  pii_handling: z.enum(["block", "redact"]).default("redact"),
  custom_patterns: z.array(CustomPatternSchema).default([]),
  vault_audit: z.boolean().default(true),
});

const EscalationSchema = z.object({
  health_threshold: z.number().min(0).max(100).default(50),
  security_findings: z.enum(["always", "never"]).default("always"),
});

const NotificationsSchema = z.object({
  daily_digest: z.enum(["compact", "summary", "full"]).default("summary"),
  delivery: z.enum(["next_session", "file_only"]).default("next_session"),
  escalation: EscalationSchema.default({}),
});

const MigrationSchema = z.object({
  auto_detect: z.boolean().default(true),
  sources: z.array(z.string()).default([]),
});

export const NeuroclawConfigSchema = z.object({
  agent: AgentSchema,
  governance: GovernanceSchema.default({}),
  memory: MemorySchema.default({}),
  retrieval: RetrievalSchema.default({}),
  consolidation: ConsolidationSchema.default({}),
  self_model: SelfModelSchema.default({}),
  multi_agent: MultiAgentSchema.default({}),
  security: SecuritySchema.default({}),
  notifications: NotificationsSchema.default({}),
  migration: MigrationSchema.default({}),
});

export type NeuroclawConfig = z.infer<typeof NeuroclawConfigSchema>;
```

- [ ] **Step 4: Write the defaults**

Create `packages/config/src/defaults.ts`:

```typescript
import type { NeuroclawConfig } from "./schema";

export const DEFAULT_CONFIG: NeuroclawConfig = {
  agent: {
    id: "default",
    role: "general",
    store_path: "~/neuroclaw/agents/${agent.id}/",
  },
  governance: {
    mode: "supervised",
  },
  memory: {
    working_memory_max_lines: 100,
    episodic: { capture: true, max_context_lines: 500 },
    procedural: { crystallization_threshold: 3 },
    forgetting: {
      enabled: true,
      decay_window_days: 30,
      min_importance_to_keep: 0.2,
      merge_before_drop: true,
      unforgettable_categories: [
        "corrections",
        "user_confirmed",
        "has_outcome",
        "procedural",
        "self_model",
      ],
      archive_policy: "keep_forever",
    },
  },
  retrieval: {
    strategy: "query_dependent",
    text: { engine: "fts5_bm25" },
    graph: { enabled: true, algorithm: "pagerank", trigger: "auto" },
    embeddings: {
      enabled: false,
      provider: null,
      model: "nomic-embed-text",
      hybrid_weight: { vector: 0.7, text: 0.3 },
    },
  },
  consolidation: {
    dream_cycle: {
      schedule: "daily",
      default_hour: 3,
      activity_trigger_threshold: 20,
      idle_behavior: "recall",
    },
    verification: {
      probe_qa: true,
      probe_sample_size: 10,
      coherence_check: true,
    },
  },
  self_model: {
    hypothesis: {
      promotion_threshold: 3,
      demotion_threshold: -2,
      decay_window_days: 60,
    },
    citation: { enabled: true },
  },
  multi_agent: {
    mode: "isolated",
    shared: {
      store_path: "~/neuroclaw/shared/",
      layers: ["semantic", "procedural"],
      write_policy: "append_only",
      dream_stagger_hours: 1,
    },
    soul: { inheritance: false, base_soul_path: null },
  },
  security: {
    sensitive_data: "block",
    pii_handling: "redact",
    custom_patterns: [],
    vault_audit: true,
  },
  notifications: {
    daily_digest: "summary",
    delivery: "next_session",
    escalation: { health_threshold: 50, security_findings: "always" },
  },
  migration: { auto_detect: true, sources: [] },
};
```

- [ ] **Step 5: Export from index.ts**

Update `packages/config/src/index.ts`:

```typescript
export { NeuroclawConfigSchema, type NeuroclawConfig } from "./schema";
export { DEFAULT_CONFIG } from "./defaults";
```

- [ ] **Step 6: Run tests**

Run: `cd packages/config && npx vitest run`

Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/config/
git commit -m "feat(config): add Zod config schema with defaults"
```

---

## Task 5: Config Loader — Layered YAML Merging

**Files:**
- Create: `packages/config/src/loader.ts`
- Create: `packages/config/src/__tests__/loader.test.ts`
- Create: `packages/config/base.yaml`

- [ ] **Step 1: Write the loader test**

Create `packages/config/src/__tests__/loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, mergeConfigs, resolveStorePath } from "../loader";

describe("mergeConfigs", () => {
  it("later layers override earlier layers", () => {
    const base = { agent: { id: "base", role: "general" } };
    const user = { agent: { id: "custom" } };
    const merged = mergeConfigs(base, user);
    expect(merged.agent.id).toBe("custom");
    expect(merged.agent.role).toBe("general");
  });

  it("deeply merges nested objects", () => {
    const base = {
      memory: { forgetting: { enabled: true, decay_window_days: 30 } },
    };
    const user = { memory: { forgetting: { decay_window_days: 60 } } };
    const merged = mergeConfigs(base, user);
    expect(merged.memory.forgetting.enabled).toBe(true);
    expect(merged.memory.forgetting.decay_window_days).toBe(60);
  });

  it("does not merge arrays — later replaces earlier", () => {
    const base = {
      memory: {
        forgetting: { unforgettable_categories: ["corrections", "procedural"] },
      },
    };
    const user = {
      memory: {
        forgetting: { unforgettable_categories: ["corrections"] },
      },
    };
    const merged = mergeConfigs(base, user);
    expect(merged.memory.forgetting.unforgettable_categories).toEqual([
      "corrections",
    ]);
  });
});

describe("resolveStorePath", () => {
  it("expands ~ to home directory", () => {
    const resolved = resolveStorePath("~/neuroclaw/agents/test/");
    expect(resolved).toBe(
      path.join(os.homedir(), "neuroclaw", "agents", "test")
    );
  });

  it("expands ${agent.id} placeholder", () => {
    const resolved = resolveStorePath(
      "~/neuroclaw/agents/${agent.id}/",
      "my-agent"
    );
    expect(resolved).toBe(
      path.join(os.homedir(), "neuroclaw", "agents", "my-agent")
    );
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads base.yaml and applies schema defaults", () => {
    const baseYaml = 'agent:\n  id: "test-agent"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("test-agent");
    expect(config.governance.mode).toBe("supervised");
  });

  it("merges user.yaml over base.yaml", () => {
    const baseYaml = 'agent:\n  id: "base"\n';
    const userYaml = 'agent:\n  id: "user-override"\ngovernance:\n  mode: "autonomous"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);
    fs.writeFileSync(path.join(tmpDir, "user.yaml"), userYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("user-override");
    expect(config.governance.mode).toBe("autonomous");
  });

  it("merges agent-specific yaml over user.yaml", () => {
    const baseYaml = 'agent:\n  id: "base"\n';
    const userYaml = 'governance:\n  mode: "supervised"\n';
    const agentYaml = 'agent:\n  id: "research"\ngovernance:\n  mode: "autonomous"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);
    fs.writeFileSync(path.join(tmpDir, "user.yaml"), userYaml);
    fs.mkdirSync(path.join(tmpDir, "agents"));
    fs.writeFileSync(path.join(tmpDir, "agents", "research.yaml"), agentYaml);

    const config = loadConfig(tmpDir, "research");
    expect(config.agent.id).toBe("research");
    expect(config.governance.mode).toBe("autonomous");
  });

  it("works with base.yaml only (no user.yaml, no agent yaml)", () => {
    const baseYaml = 'agent:\n  id: "solo"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), baseYaml);

    const config = loadConfig(tmpDir);
    expect(config.agent.id).toBe("solo");
  });

  it("throws on invalid config", () => {
    const badYaml = 'governance:\n  mode: "yolo"\n';
    fs.writeFileSync(path.join(tmpDir, "base.yaml"), badYaml);

    expect(() => loadConfig(tmpDir)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/config && npx vitest run`

Expected: FAIL — loader module doesn't exist.

- [ ] **Step 3: Write the loader**

Create `packages/config/src/loader.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";
import { NeuroclawConfigSchema, type NeuroclawConfig } from "./schema";

/**
 * Deep merge two plain objects. Arrays are replaced, not merged.
 * Later values override earlier values.
 */
export function mergeConfigs(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key]) &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeConfigs(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Resolve a store path: expand ~, replace ${agent.id}.
 */
export function resolveStorePath(
  storePath: string,
  agentId?: string
): string {
  let resolved = storePath;
  if (resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  }
  if (agentId) {
    resolved = resolved.replace("${agent.id}", agentId);
  }
  // Normalize and remove trailing separator
  resolved = path.normalize(resolved);
  if (resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }
  return resolved;
}

function loadYamlFile(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return (yaml.load(content) as Record<string, any>) ?? {};
}

/**
 * Load config from a config directory.
 * Merge order: base.yaml → platform.yaml → user.yaml → agents/{agentId}.yaml
 * Validates against schema. Throws on invalid config.
 */
export function loadConfig(
  configDir: string,
  agentId?: string
): NeuroclawConfig {
  const base = loadYamlFile(path.join(configDir, "base.yaml")) ?? {};
  const platform = loadYamlFile(path.join(configDir, "platform.yaml")) ?? {};
  const user = loadYamlFile(path.join(configDir, "user.yaml")) ?? {};

  let agent = {};
  if (agentId) {
    agent =
      loadYamlFile(path.join(configDir, "agents", `${agentId}.yaml`)) ?? {};
  }

  const merged = mergeConfigs(
    mergeConfigs(mergeConfigs(base, platform), user),
    agent
  );

  return NeuroclawConfigSchema.parse(merged);
}
```

- [ ] **Step 4: Create base.yaml**

Create `packages/config/base.yaml`:

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
    layers:
      - "semantic"
      - "procedural"
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

- [ ] **Step 5: Export loader from index.ts**

Update `packages/config/src/index.ts`:

```typescript
export { NeuroclawConfigSchema, type NeuroclawConfig } from "./schema";
export { DEFAULT_CONFIG } from "./defaults";
export { loadConfig, mergeConfigs, resolveStorePath } from "./loader";
```

- [ ] **Step 6: Run tests**

Run: `cd packages/config && npx vitest run`

Expected: all tests PASS (schema + loader).

- [ ] **Step 7: Commit**

```bash
git add packages/config/
git commit -m "feat(config): add layered YAML config loader with merge semantics"
```

---

## Task 6: Security Scanner (@neuroclaw/governance)

**Files:**
- Create: `packages/governance/src/scanner.ts`
- Create: `packages/governance/src/__tests__/scanner.test.ts`
- Create: `packages/governance/src/types.ts`

- [ ] **Step 1: Write the scanner test**

Create `packages/governance/src/__tests__/scanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { SecurityScanner, type ScanResult } from "../scanner";

describe("SecurityScanner", () => {
  const scanner = new SecurityScanner({
    sensitive_data: "block",
    pii_handling: "redact",
    custom_patterns: [],
    vault_audit: true,
  });

  describe("API key detection", () => {
    it("blocks OpenAI API keys", () => {
      const result = scanner.scan("My key is sk-proj-abc123def456ghi789");
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("blocks AWS access keys", () => {
      const result = scanner.scan("aws_key=AKIAIOSFODNN7EXAMPLE");
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("blocks GitHub tokens", () => {
      const result = scanner.scan("token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(result.blocked).toBe(true);
    });

    it("blocks Slack tokens", () => {
      const result = scanner.scan("SLACK_TOKEN=xoxb-123456789-abcdef");
      expect(result.blocked).toBe(true);
    });

    it("blocks bearer tokens", () => {
      const result = scanner.scan('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoidmFsdWUifQ.abc123');
      expect(result.blocked).toBe(true);
    });
  });

  describe("credential detection", () => {
    it("blocks password assignments", () => {
      const result = scanner.scan('password=hunter2');
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("credential");
    });

    it("blocks connection strings with credentials", () => {
      const result = scanner.scan(
        "postgres://user:secret@host:5432/db"
      );
      expect(result.blocked).toBe(true);
    });

    it("blocks secret assignments", () => {
      const result = scanner.scan("CLIENT_SECRET=abcdef123456");
      expect(result.blocked).toBe(true);
    });
  });

  describe("private key detection", () => {
    it("blocks PEM private keys", () => {
      const result = scanner.scan(
        "-----BEGIN RSA PRIVATE KEY-----\nMIIE..."
      );
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("private_key");
    });
  });

  describe("environment variable detection", () => {
    it("blocks export SECRET lines", () => {
      const result = scanner.scan('export SECRET_KEY="mysecret123"');
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("env_variable");
    });
  });

  describe("PII handling", () => {
    it("redacts email addresses", () => {
      const result = scanner.scan("Contact me at user@example.com");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:email]");
    });

    it("redacts phone numbers", () => {
      const result = scanner.scan("Call me at +1-555-123-4567");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:phone]");
    });
  });

  describe("safe content", () => {
    it("passes clean text through", () => {
      const result = scanner.scan(
        "This project uses TypeScript and React for the frontend."
      );
      expect(result.blocked).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.redacted).toBe(
        "This project uses TypeScript and React for the frontend."
      );
    });

    it("does not flag code that mentions keys conceptually", () => {
      const result = scanner.scan(
        "The API key should be stored in environment variables, never in code."
      );
      expect(result.blocked).toBe(false);
    });
  });

  describe("custom patterns", () => {
    const customScanner = new SecurityScanner({
      sensitive_data: "block",
      pii_handling: "redact",
      custom_patterns: [
        { name: "internal-urls", pattern: "https://internal\\.company\\..*", action: "redact" },
      ],
      vault_audit: true,
    });

    it("redacts custom patterns", () => {
      const result = customScanner.scan("Check https://internal.company.com/dashboard");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:internal-urls]");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/governance && npx vitest run`

Expected: FAIL — scanner module doesn't exist.

- [ ] **Step 3: Write the scanner**

Create `packages/governance/src/scanner.ts`:

```typescript
export interface SecurityConfig {
  sensitive_data: "block" | "redact";
  pii_handling: "block" | "redact";
  custom_patterns: CustomPattern[];
  vault_audit: boolean;
}

export interface CustomPattern {
  name: string;
  pattern: string;
  action: "block" | "redact";
}

export interface ScanFinding {
  type: "api_key" | "credential" | "private_key" | "env_variable" | "pii" | "custom";
  pattern: string;
  match: string;
  action: "block" | "redact";
}

export interface ScanResult {
  blocked: boolean;
  findings: ScanFinding[];
  redacted: string;
}

// Always-blocked patterns (hardcoded, no config override)
const ALWAYS_BLOCK_PATTERNS: Array<{
  type: ScanFinding["type"];
  pattern: RegExp;
  name: string;
}> = [
  // API keys
  { type: "api_key", pattern: /sk-[a-zA-Z0-9_-]{20,}/, name: "OpenAI key" },
  { type: "api_key", pattern: /AKIA[0-9A-Z]{16}/, name: "AWS access key" },
  { type: "api_key", pattern: /ghp_[a-zA-Z0-9]{36,}/, name: "GitHub PAT" },
  { type: "api_key", pattern: /xox[bpors]-[a-zA-Z0-9-]+/, name: "Slack token" },
  {
    type: "api_key",
    pattern: /Bearer\s+eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    name: "Bearer JWT",
  },
  // Credentials
  {
    type: "credential",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*\S+/i,
    name: "password assignment",
  },
  {
    type: "credential",
    pattern: /(?:secret|client_secret|api_secret)\s*[=:]\s*\S+/i,
    name: "secret assignment",
  },
  {
    type: "credential",
    pattern: /[a-zA-Z]+:\/\/[^:]+:[^@]+@[^/]+/,
    name: "connection string with credentials",
  },
  // Private keys
  {
    type: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
    name: "PEM private key",
  },
  // Environment variables with secrets
  {
    type: "env_variable",
    pattern: /export\s+(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIALS?)[_A-Z]*\s*=/i,
    name: "exported secret env var",
  },
];

// PII patterns (configurable action)
const PII_PATTERNS: Array<{
  subtype: string;
  pattern: RegExp;
}> = [
  { subtype: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { subtype: "phone", pattern: /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ },
];

export class SecurityScanner {
  private config: SecurityConfig;
  private customRegexes: Array<{ name: string; regex: RegExp; action: "block" | "redact" }>;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.customRegexes = config.custom_patterns.map((p) => ({
      name: p.name,
      regex: new RegExp(p.pattern),
      action: p.action,
    }));
  }

  scan(content: string): ScanResult {
    const findings: ScanFinding[] = [];
    let redacted = content;
    let blocked = false;

    // Always-blocked patterns
    for (const { type, pattern, name } of ALWAYS_BLOCK_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        blocked = true;
        findings.push({
          type,
          pattern: name,
          match: match[0].slice(0, 20) + "...",
          action: "block",
        });
      }
    }

    // If blocked, return early — no point redacting
    if (blocked) {
      return { blocked, findings, redacted: content };
    }

    // PII patterns
    for (const { subtype, pattern } of PII_PATTERNS) {
      const matches = content.match(new RegExp(pattern.source, "g"));
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "pii",
            pattern: subtype,
            match: match.slice(0, 10) + "...",
            action: this.config.pii_handling,
          });
          if (this.config.pii_handling === "redact") {
            redacted = redacted.replace(match, `[REDACTED:${subtype}]`);
          } else {
            blocked = true;
          }
        }
      }
    }

    // Custom patterns
    for (const { name, regex, action } of this.customRegexes) {
      const matches = content.match(new RegExp(regex.source, "g"));
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "custom",
            pattern: name,
            match: match.slice(0, 20) + "...",
            action,
          });
          if (action === "redact") {
            redacted = redacted.replace(match, `[REDACTED:${name}]`);
          } else {
            blocked = true;
          }
        }
      }
    }

    return { blocked, findings, redacted };
  }
}
```

- [ ] **Step 4: Export from index.ts**

Update `packages/governance/src/index.ts`:

```typescript
export { SecurityScanner, type SecurityConfig, type ScanResult, type ScanFinding } from "./scanner";
```

- [ ] **Step 5: Run tests**

Run: `cd packages/governance && npx vitest run`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/governance/
git commit -m "feat(governance): add pre-write security scanner with always-block patterns"
```

---

## Task 7: Governance Mode Enforcement + Audit Trail

**Files:**
- Create: `packages/governance/src/mode.ts`
- Create: `packages/governance/src/audit.ts`
- Create: `packages/governance/src/invariants.ts`
- Create: `packages/governance/src/__tests__/mode.test.ts`
- Create: `packages/governance/src/__tests__/audit.test.ts`
- Create: `packages/governance/src/__tests__/invariants.test.ts`

- [ ] **Step 1: Write the mode enforcement test**

Create `packages/governance/src/__tests__/mode.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { GovernanceGate, type Operation } from "../mode";

describe("GovernanceGate", () => {
  describe("autonomous mode", () => {
    const gate = new GovernanceGate("autonomous");

    it("allows episodic capture without approval", () => {
      expect(gate.requiresApproval("episodic_capture")).toBe(false);
    });

    it("allows semantic consolidation without approval", () => {
      expect(gate.requiresApproval("semantic_consolidation")).toBe(false);
    });

    it("allows self-model mutation without approval (logged)", () => {
      expect(gate.requiresApproval("self_model_mutation")).toBe(false);
    });

    it("requires approval for config changes", () => {
      expect(gate.requiresApproval("config_change")).toBe(true);
    });
  });

  describe("supervised mode", () => {
    const gate = new GovernanceGate("supervised");

    it("allows episodic capture without approval", () => {
      expect(gate.requiresApproval("episodic_capture")).toBe(false);
    });

    it("allows semantic consolidation without approval", () => {
      expect(gate.requiresApproval("semantic_consolidation")).toBe(false);
    });

    it("requires approval for self-model mutation", () => {
      expect(gate.requiresApproval("self_model_mutation")).toBe(true);
    });

    it("requires approval for hypothesis promotion", () => {
      expect(gate.requiresApproval("hypothesis_promotion")).toBe(true);
    });

    it("requires approval for config changes", () => {
      expect(gate.requiresApproval("config_change")).toBe(true);
    });
  });

  describe("gated mode", () => {
    const gate = new GovernanceGate("gated");

    it("allows episodic capture without approval", () => {
      expect(gate.requiresApproval("episodic_capture")).toBe(false);
    });

    it("requires approval for semantic consolidation", () => {
      expect(gate.requiresApproval("semantic_consolidation")).toBe(true);
    });

    it("requires approval for self-model mutation", () => {
      expect(gate.requiresApproval("self_model_mutation")).toBe(true);
    });

    it("requires approval for config changes", () => {
      expect(gate.requiresApproval("config_change")).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/governance && npx vitest run src/__tests__/mode.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write mode enforcement**

Create `packages/governance/src/mode.ts`:

```typescript
import type { GovernanceMode } from "@neuroclaw/core";

export type Operation =
  | "episodic_capture"
  | "working_memory_update"
  | "correction_detection"
  | "semantic_consolidation"
  | "procedural_update"
  | "self_model_mutation"
  | "hypothesis_promotion"
  | "config_change"
  | "graph_edge_update"
  | "knowledge_graph_prune";

// Operations that always auto-execute (never need approval)
const ALWAYS_AUTO: Operation[] = [
  "episodic_capture",
  "working_memory_update",
  "correction_detection",
  "graph_edge_update",
];

// Operations that always require approval
const ALWAYS_APPROVE: Operation[] = ["config_change"];

// Operations that require approval in supervised mode
const SUPERVISED_APPROVE: Operation[] = [
  "self_model_mutation",
  "hypothesis_promotion",
];

// Operations that require approval in gated mode (in addition to supervised)
const GATED_APPROVE: Operation[] = [
  "semantic_consolidation",
  "procedural_update",
  "knowledge_graph_prune",
];

export class GovernanceGate {
  private mode: GovernanceMode;

  constructor(mode: GovernanceMode) {
    this.mode = mode;
  }

  requiresApproval(operation: Operation): boolean {
    if (ALWAYS_AUTO.includes(operation)) return false;
    if (ALWAYS_APPROVE.includes(operation)) return true;

    if (this.mode === "autonomous") return false;

    if (this.mode === "supervised") {
      return SUPERVISED_APPROVE.includes(operation);
    }

    // gated: supervised + gated operations need approval
    return (
      SUPERVISED_APPROVE.includes(operation) ||
      GATED_APPROVE.includes(operation)
    );
  }

  getMode(): GovernanceMode {
    return this.mode;
  }

  setMode(mode: GovernanceMode): void {
    this.mode = mode;
  }
}
```

- [ ] **Step 4: Write the audit trail test**

Create `packages/governance/src/__tests__/audit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AuditTrail } from "../audit";

describe("AuditTrail", () => {
  let tmpDir: string;
  let auditPath: string;
  let trail: AuditTrail;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-audit-"));
    auditPath = path.join(tmpDir, "audit-trail.md");
    trail = new AuditTrail(auditPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates the audit file on first log", () => {
    trail.log({
      operation: "semantic_consolidation",
      component: "semantic/domains/typescript.md",
      description: "Created new semantic entry",
      evidence: ["session-2026-04-01-abc"],
    });
    expect(fs.existsSync(auditPath)).toBe(true);
  });

  it("appends entries with timestamps", () => {
    trail.log({
      operation: "self_model_mutation",
      component: "capabilities.md",
      description: "Added TypeScript as strength",
      evidence: ["session-abc", "session-def"],
    });
    trail.log({
      operation: "hypothesis_promotion",
      component: "hypotheses.md",
      description: "Promoted hyp-001 to confirmed",
      evidence: ["session-ghi"],
    });

    const content = fs.readFileSync(auditPath, "utf-8");
    const entries = content.split("\n---\n").filter((e) => e.trim());
    expect(entries.length).toBe(2);
  });

  it("never contains sensitive data in the log", () => {
    trail.log({
      operation: "episodic_capture",
      component: "episodic/2026-04-01/session-abc.md",
      description: "Blocked write: credential detected",
      evidence: [],
    });

    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).not.toContain("password");
    expect(content).not.toContain("sk-");
  });
});
```

- [ ] **Step 5: Write the audit trail**

Create `packages/governance/src/audit.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

export interface AuditEntry {
  operation: string;
  component: string;
  description: string;
  evidence: string[];
}

export class AuditTrail {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  log(entry: AuditEntry): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const evidenceStr =
      entry.evidence.length > 0
        ? entry.evidence.map((e) => `  - ${e}`).join("\n")
        : "  (none)";

    const block = [
      `**${timestamp}** | \`${entry.operation}\``,
      `Component: \`${entry.component}\``,
      `Description: ${entry.description}`,
      `Evidence:`,
      evidenceStr,
      "",
      "---",
      "",
    ].join("\n");

    fs.appendFileSync(this.filePath, block);
  }
}
```

- [ ] **Step 6: Write the invariants test**

Create `packages/governance/src/__tests__/invariants.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { checkInvariant, InvariantViolation } from "../invariants";

describe("invariants", () => {
  it("rejects governance escalation by agent", () => {
    expect(() =>
      checkInvariant("governance_escalation", {
        currentMode: "supervised",
        requestedMode: "autonomous",
        requestedBy: "agent",
      })
    ).toThrow(InvariantViolation);
  });

  it("allows governance escalation by user", () => {
    expect(() =>
      checkInvariant("governance_escalation", {
        currentMode: "supervised",
        requestedMode: "autonomous",
        requestedBy: "user",
      })
    ).not.toThrow();
  });

  it("allows governance de-escalation by agent", () => {
    expect(() =>
      checkInvariant("governance_escalation", {
        currentMode: "autonomous",
        requestedMode: "supervised",
        requestedBy: "agent",
      })
    ).not.toThrow();
  });

  it("rejects CORE identity modification without user request", () => {
    expect(() =>
      checkInvariant("core_identity_modification", {
        requestedBy: "agent",
      })
    ).toThrow(InvariantViolation);
  });

  it("allows CORE identity modification by user", () => {
    expect(() =>
      checkInvariant("core_identity_modification", {
        requestedBy: "user",
      })
    ).not.toThrow();
  });
});
```

- [ ] **Step 7: Write invariants**

Create `packages/governance/src/invariants.ts`:

```typescript
import type { GovernanceMode } from "@neuroclaw/core";

export class InvariantViolation extends Error {
  constructor(invariant: string, details: string) {
    super(`Invariant violation [${invariant}]: ${details}`);
    this.name = "InvariantViolation";
  }
}

const MODE_RANK: Record<GovernanceMode, number> = {
  gated: 0,
  supervised: 1,
  autonomous: 2,
};

type InvariantCheck = (context: Record<string, any>) => void;

const INVARIANTS: Record<string, InvariantCheck> = {
  governance_escalation: (ctx) => {
    const { currentMode, requestedMode, requestedBy } = ctx;
    if (
      requestedBy === "agent" &&
      MODE_RANK[requestedMode as GovernanceMode] >
        MODE_RANK[currentMode as GovernanceMode]
    ) {
      throw new InvariantViolation(
        "governance_escalation",
        "Agent cannot escalate its own governance level"
      );
    }
  },

  core_identity_modification: (ctx) => {
    if (ctx.requestedBy === "agent") {
      throw new InvariantViolation(
        "core_identity_modification",
        "CORE identity sections can only be modified by explicit user request"
      );
    }
  },
};

export function checkInvariant(
  invariant: string,
  context: Record<string, any>
): void {
  const check = INVARIANTS[invariant];
  if (!check) {
    throw new Error(`Unknown invariant: ${invariant}`);
  }
  check(context);
}
```

- [ ] **Step 8: Update governance index.ts**

```typescript
export { SecurityScanner, type SecurityConfig, type ScanResult, type ScanFinding } from "./scanner";
export { GovernanceGate, type Operation } from "./mode";
export { AuditTrail, type AuditEntry } from "./audit";
export { checkInvariant, InvariantViolation } from "./invariants";
```

- [ ] **Step 9: Run all governance tests**

Run: `cd packages/governance && npx vitest run`

Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/governance/
git commit -m "feat(governance): add mode enforcement, audit trail, and invariant checks"
```

---

## Task 8: Memory Vault — Markdown Read/Write

**Files:**
- Create: `packages/memory/src/vault.ts`
- Create: `packages/memory/src/types.ts`
- Create: `packages/memory/src/__tests__/vault.test.ts`

- [ ] **Step 1: Write the vault test**

Create `packages/memory/src/__tests__/vault.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Vault } from "../vault";

describe("Vault", () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-vault-"));
    vault = new Vault(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe("initialization", () => {
    it("creates vault directory structure on init", () => {
      vault.init();
      expect(fs.existsSync(path.join(tmpDir, "working.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "episodic"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "semantic", "domains"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "semantic", "projects"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "procedural"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "self-model"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "dreams"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "archive"))).toBe(true);
    });

    it("creates default self-model files on init", () => {
      vault.init();
      expect(
        fs.existsSync(path.join(tmpDir, "self-model", "identity.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "self-model", "capabilities.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "self-model", "hypotheses.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "self-model", "evolution-log.md"))
      ).toBe(true);
    });
  });

  describe("read/write", () => {
    it("writes and reads a file", () => {
      vault.init();
      vault.write("semantic/domains/typescript.md", "# TypeScript\n\nTS is great.");
      const content = vault.read("semantic/domains/typescript.md");
      expect(content).toBe("# TypeScript\n\nTS is great.");
    });

    it("returns null for non-existent file", () => {
      vault.init();
      const content = vault.read("semantic/domains/nonexistent.md");
      expect(content).toBeNull();
    });

    it("creates parent directories on write", () => {
      vault.init();
      vault.write("episodic/2026-04-01/session-abc.md", "# Episode");
      const content = vault.read("episodic/2026-04-01/session-abc.md");
      expect(content).toBe("# Episode");
    });

    it("appends to a file", () => {
      vault.init();
      vault.write("self-model/evolution-log.md", "Entry 1\n");
      vault.append("self-model/evolution-log.md", "Entry 2\n");
      const content = vault.read("self-model/evolution-log.md");
      expect(content).toBe("Entry 1\nEntry 2\n");
    });
  });

  describe("list", () => {
    it("lists files in a directory", () => {
      vault.init();
      vault.write("semantic/domains/ts.md", "content");
      vault.write("semantic/domains/python.md", "content");
      const files = vault.list("semantic/domains");
      expect(files).toContain("ts.md");
      expect(files).toContain("python.md");
    });

    it("returns empty array for non-existent directory", () => {
      vault.init();
      const files = vault.list("nonexistent");
      expect(files).toEqual([]);
    });
  });

  describe("exists", () => {
    it("returns true for existing file", () => {
      vault.init();
      expect(vault.exists("working.md")).toBe(true);
    });

    it("returns false for non-existing file", () => {
      vault.init();
      expect(vault.exists("nope.md")).toBe(false);
    });
  });

  describe("move", () => {
    it("moves a file to archive", () => {
      vault.init();
      vault.write("semantic/domains/old.md", "old content");
      vault.move("semantic/domains/old.md", "archive/old.md");
      expect(vault.exists("semantic/domains/old.md")).toBe(false);
      expect(vault.read("archive/old.md")).toBe("old content");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/memory && npx vitest run src/__tests__/vault.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write the vault**

Create `packages/memory/src/vault.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_IDENTITY = `<!-- CORE -->
I am a coding agent focused on helping my user write correct, maintainable software.
I am honest about what I don't know.
<!-- /CORE -->

<!-- MUTABLE -->
(No learned traits yet — these emerge from experience.)
<!-- /MUTABLE -->
`;

const DEFAULT_CAPABILITIES = `# Capabilities

## Strengths
(None confirmed yet — these are built from evidence.)

## Weaknesses
(None detected yet.)

## Unknown
(Everything — this fills in as I encounter tasks.)
`;

const DEFAULT_HYPOTHESES = `# Hypotheses

(No behavioral hypotheses yet — these form from observations.)
`;

const VAULT_DIRS = [
  "episodic",
  "semantic/domains",
  "semantic/projects",
  "procedural",
  "self-model",
  "dreams",
  "archive",
];

export class Vault {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  init(): void {
    // Create directory structure
    for (const dir of VAULT_DIRS) {
      fs.mkdirSync(this.resolve(dir), { recursive: true });
    }

    // Create default files if they don't exist
    if (!this.exists("working.md")) {
      this.write("working.md", "# Working Memory\n\n(Empty — will be populated from interactions.)\n");
    }
    if (!this.exists("self-model/identity.md")) {
      this.write("self-model/identity.md", DEFAULT_IDENTITY);
    }
    if (!this.exists("self-model/capabilities.md")) {
      this.write("self-model/capabilities.md", DEFAULT_CAPABILITIES);
    }
    if (!this.exists("self-model/hypotheses.md")) {
      this.write("self-model/hypotheses.md", DEFAULT_HYPOTHESES);
    }
    if (!this.exists("self-model/evolution-log.md")) {
      this.write("self-model/evolution-log.md", "# Evolution Log\n\n");
    }
  }

  read(relativePath: string): string | null {
    const fullPath = this.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, "utf-8");
  }

  write(relativePath: string, content: string): void {
    const fullPath = this.resolve(relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  append(relativePath: string, content: string): void {
    const fullPath = this.resolve(relativePath);
    fs.appendFileSync(fullPath, content);
  }

  exists(relativePath: string): boolean {
    return fs.existsSync(this.resolve(relativePath));
  }

  list(relativePath: string): string[] {
    const fullPath = this.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath).filter((f) => {
      return fs.statSync(path.join(fullPath, f)).isFile();
    });
  }

  move(from: string, to: string): void {
    const content = this.read(from);
    if (content === null) {
      throw new Error(`File not found: ${from}`);
    }
    this.write(to, content);
    fs.unlinkSync(this.resolve(from));
  }

  getRoot(): string {
    return this.root;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/memory && npx vitest run src/__tests__/vault.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): add markdown vault with read/write/list/move operations"
```

---

## Task 9: SQLite Schema + FTS5

**Files:**
- Create: `packages/memory/src/sqlite.ts`
- Create: `packages/memory/src/__tests__/sqlite.test.ts`

- [ ] **Step 1: Write the SQLite test**

Create `packages/memory/src/__tests__/sqlite.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";

describe("NeuroclawDB", () => {
  let tmpDir: string;
  let db: NeuroclawDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-db-"));
    db = new NeuroclawDB(path.join(tmpDir, "index.db"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates all tables on initialization", () => {
    const tables = db.listTables();
    expect(tables).toContain("episodes");
    expect(tables).toContain("semantic");
    expect(tables).toContain("procedures");
    expect(tables).toContain("relations");
    expect(tables).toContain("hypotheses");
    expect(tables).toContain("chunks_fts");
  });

  it("uses WAL mode", () => {
    const mode = db.getJournalMode();
    expect(mode).toBe("wal");
  });

  describe("episodes", () => {
    it("inserts and retrieves an episode", () => {
      db.insertEpisode({
        id: "ep-001",
        timestamp: Date.now(),
        session_id: "session-abc",
        project: "neuroclaw",
        importance: 0.8,
        is_correction: false,
        outcome_signal: 0.5,
        consolidation_status: "pending",
        file_path: "episodic/2026-04-01/session-abc.md",
        summary: "Implemented config loader",
      });

      const episodes = db.getPendingEpisodes();
      expect(episodes).toHaveLength(1);
      expect(episodes[0].id).toBe("ep-001");
      expect(episodes[0].consolidation_status).toBe("pending");
    });
  });

  describe("semantic", () => {
    it("inserts and retrieves a semantic entry", () => {
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
      });

      const entry = db.getSemantic("sem-001");
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe("typescript");
    });
  });

  describe("FTS5 search", () => {
    it("indexes and searches content", () => {
      db.indexContent("sem-001", "semantic", "TypeScript barrel exports are the convention");
      db.indexContent("sem-002", "semantic", "Python uses __init__.py for package imports");

      const results = db.searchFTS("barrel exports");
      expect(results).toHaveLength(1);
      expect(results[0].source_id).toBe("sem-001");
    });

    it("ranks by BM25 relevance", () => {
      db.indexContent("a", "semantic", "TypeScript types are useful for safety");
      db.indexContent("b", "semantic", "TypeScript TypeScript TypeScript types everywhere");

      const results = db.searchFTS("TypeScript types");
      expect(results.length).toBeGreaterThanOrEqual(2);
      // b should rank higher (more term frequency)
      expect(results[0].source_id).toBe("b");
    });
  });

  describe("relations", () => {
    it("inserts and queries relations", () => {
      db.insertRelation({
        source_id: "sem-001",
        target_id: "sem-002",
        relation_type: "supports",
        weight: 0.8,
        created: Date.now(),
        last_used: Date.now(),
      });

      const relations = db.getRelationsFrom("sem-001");
      expect(relations).toHaveLength(1);
      expect(relations[0].target_id).toBe("sem-002");
      expect(relations[0].relation_type).toBe("supports");
    });
  });

  describe("hypotheses", () => {
    it("inserts and updates hypothesis status", () => {
      db.insertHypothesis({
        id: "hyp-001",
        claim: "User prefers named exports",
        evidence_for: 2,
        evidence_against: 0,
        status: "tentative",
        created: Date.now(),
        last_tested: Date.now(),
        outcome_score: 0.0,
      });

      db.updateHypothesisStatus("hyp-001", "confirmed");
      const hyp = db.getHypothesis("hyp-001");
      expect(hyp!.status).toBe("confirmed");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/memory && npx vitest run src/__tests__/sqlite.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write the SQLite module**

Create `packages/memory/src/sqlite.ts`:

```typescript
import Database from "better-sqlite3";
import type {
  EpisodeRecord,
  SemanticRecord,
  ProcedureRecord,
  RelationRecord,
  HypothesisRecord,
  HypothesisStatus,
} from "@neuroclaw/core";

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

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    source_id UNINDEXED,
    source_type UNINDEXED
  );
`;

export class NeuroclawDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  listTables(): string[] {
    const rows = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  getJournalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    return row.journal_mode;
  }

  // --- Episodes ---

  insertEpisode(ep: EpisodeRecord): void {
    this.db
      .prepare(
        `INSERT INTO episodes (id, timestamp, session_id, project, importance, is_correction, outcome_signal, consolidation_status, file_path, summary)
         VALUES (@id, @timestamp, @session_id, @project, @importance, @is_correction, @outcome_signal, @consolidation_status, @file_path, @summary)`
      )
      .run({
        ...ep,
        is_correction: ep.is_correction ? 1 : 0,
      });
  }

  getPendingEpisodes(): EpisodeRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM episodes WHERE consolidation_status = 'pending' ORDER BY importance DESC"
      )
      .all() as any[];
    return rows.map((r) => ({ ...r, is_correction: Boolean(r.is_correction) }));
  }

  // --- Semantic ---

  insertSemantic(entry: SemanticRecord): void {
    this.db
      .prepare(
        `INSERT INTO semantic (id, domain, created, last_accessed, importance, ref_count, confidence, file_path, line_range)
         VALUES (@id, @domain, @created, @last_accessed, @importance, @ref_count, @confidence, @file_path, @line_range)`
      )
      .run(entry);
  }

  getSemantic(id: string): SemanticRecord | null {
    return (
      (this.db.prepare("SELECT * FROM semantic WHERE id = ?").get(id) as
        | SemanticRecord
        | undefined) ?? null
    );
  }

  // --- Procedures ---

  insertProcedure(proc: ProcedureRecord): void {
    this.db
      .prepare(
        `INSERT INTO procedures (id, name, task_type, success_count, last_used, file_path)
         VALUES (@id, @name, @task_type, @success_count, @last_used, @file_path)`
      )
      .run(proc);
  }

  // --- Relations ---

  insertRelation(rel: RelationRecord): void {
    this.db
      .prepare(
        `INSERT INTO relations (source_id, target_id, relation_type, weight, created, last_used)
         VALUES (@source_id, @target_id, @relation_type, @weight, @created, @last_used)`
      )
      .run(rel);
  }

  getRelationsFrom(sourceId: string): RelationRecord[] {
    return this.db
      .prepare("SELECT * FROM relations WHERE source_id = ?")
      .all(sourceId) as RelationRecord[];
  }

  // --- Hypotheses ---

  insertHypothesis(hyp: HypothesisRecord): void {
    this.db
      .prepare(
        `INSERT INTO hypotheses (id, claim, evidence_for, evidence_against, status, created, last_tested, outcome_score)
         VALUES (@id, @claim, @evidence_for, @evidence_against, @status, @created, @last_tested, @outcome_score)`
      )
      .run(hyp);
  }

  getHypothesis(id: string): HypothesisRecord | null {
    return (
      (this.db.prepare("SELECT * FROM hypotheses WHERE id = ?").get(id) as
        | HypothesisRecord
        | undefined) ?? null
    );
  }

  updateHypothesisStatus(id: string, status: HypothesisStatus): void {
    this.db
      .prepare("UPDATE hypotheses SET status = ? WHERE id = ?")
      .run(status, id);
  }

  // --- FTS5 ---

  indexContent(sourceId: string, sourceType: string, content: string): void {
    this.db
      .prepare(
        "INSERT INTO chunks_fts (content, source_id, source_type) VALUES (?, ?, ?)"
      )
      .run(content, sourceId, sourceType);
  }

  searchFTS(
    query: string,
    limit: number = 20
  ): Array<{ source_id: string; source_type: string; rank: number }> {
    return this.db
      .prepare(
        `SELECT source_id, source_type, rank
         FROM chunks_fts
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit) as Array<{
      source_id: string;
      source_type: string;
      rank: number;
    }>;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/memory && npx vitest run src/__tests__/sqlite.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): add SQLite schema with FTS5 search, WAL mode, all tables"
```

---

## Task 10: Working Memory Manager

**Files:**
- Create: `packages/memory/src/working-memory.ts`
- Create: `packages/memory/src/__tests__/working-memory.test.ts`

- [ ] **Step 1: Write the working memory test**

Create `packages/memory/src/__tests__/working-memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Vault } from "../vault";
import { WorkingMemory } from "../working-memory";

describe("WorkingMemory", () => {
  let tmpDir: string;
  let vault: Vault;
  let wm: WorkingMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-wm-"));
    vault = new Vault(tmpDir);
    vault.init();
    wm = new WorkingMemory(vault, 10); // Low limit for testing
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads working memory content", () => {
    const content = wm.load();
    expect(content).toContain("Working Memory");
  });

  it("adds an entry", () => {
    wm.addEntry("User prefers TypeScript over JavaScript");
    const content = wm.load();
    expect(content).toContain("User prefers TypeScript over JavaScript");
  });

  it("prunes when exceeding max lines", () => {
    // Fill past the 10-line limit
    for (let i = 0; i < 12; i++) {
      wm.addEntry(`Entry number ${i}`);
    }
    const content = wm.load();
    const lines = content.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it("preserves most recent entries when pruning", () => {
    for (let i = 0; i < 12; i++) {
      wm.addEntry(`Entry ${i}`);
    }
    const content = wm.load();
    expect(content).toContain("Entry 11");
    expect(content).not.toContain("Entry 0");
  });

  it("replaces an existing entry by key", () => {
    wm.addEntry("Project: old-project", "project");
    wm.addEntry("Project: new-project", "project");
    const content = wm.load();
    expect(content).toContain("new-project");
    expect(content).not.toContain("old-project");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/memory && npx vitest run src/__tests__/working-memory.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write working memory manager**

Create `packages/memory/src/working-memory.ts`:

```typescript
import type { Vault } from "./vault";

const WORKING_MEMORY_FILE = "working.md";
const HEADER = "# Working Memory\n\n";

interface Entry {
  key?: string;
  text: string;
}

export class WorkingMemory {
  private vault: Vault;
  private maxLines: number;

  constructor(vault: Vault, maxLines: number = 100) {
    this.vault = vault;
    this.maxLines = maxLines;
  }

  load(): string {
    return this.vault.read(WORKING_MEMORY_FILE) ?? HEADER;
  }

  addEntry(text: string, key?: string): void {
    const lines = this.parseEntries();

    if (key) {
      // Replace existing entry with same key
      const idx = lines.findIndex((l) => l.key === key);
      if (idx !== -1) {
        lines[idx] = { key, text };
      } else {
        lines.push({ key, text });
      }
    } else {
      lines.push({ text });
    }

    this.writeEntries(lines);
  }

  private parseEntries(): Entry[] {
    const content = this.load();
    const lines = content.split("\n");
    const entries: Entry[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip header and empty lines
      if (!trimmed || trimmed.startsWith("#") || trimmed === "(Empty — will be populated from interactions.)") {
        continue;
      }

      // Check for key prefix: [key] text
      const keyMatch = trimmed.match(/^\[([^\]]+)\]\s+(.+)/);
      if (keyMatch) {
        entries.push({ key: keyMatch[1], text: keyMatch[2] });
      } else {
        entries.push({ text: trimmed.replace(/^- /, "") });
      }
    }

    return entries;
  }

  private writeEntries(entries: Entry[]): void {
    // Prune from the front (oldest) if over limit
    while (entries.length > this.maxLines) {
      entries.shift();
    }

    const lines = entries.map((e) => {
      if (e.key) {
        return `- [${e.key}] ${e.text}`;
      }
      return `- ${e.text}`;
    });

    const content = HEADER + lines.join("\n") + "\n";
    this.vault.write(WORKING_MEMORY_FILE, content);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/memory && npx vitest run src/__tests__/working-memory.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): add working memory manager with key-based replacement and pruning"
```

---

## Task 11: Importance Scoring

**Files:**
- Create: `packages/memory/src/importance.ts`
- Create: `packages/memory/src/__tests__/importance.test.ts`

- [ ] **Step 1: Write the importance test**

Create `packages/memory/src/__tests__/importance.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeImportance } from "../importance";

describe("computeImportance", () => {
  it("returns a value between 0 and 1", () => {
    const score = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 1,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("corrections get a significant boost", () => {
    const withoutCorrection = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const withCorrection = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: true,
    });
    expect(withCorrection).toBeGreaterThan(withoutCorrection);
  });

  it("positive outcome increases importance", () => {
    const neutral = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const positive = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 1.0,
      isCorrection: false,
    });
    expect(positive).toBeGreaterThan(neutral);
  });

  it("negative outcome also increases importance (failure is valuable)", () => {
    const neutral = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const negative = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: -1.0,
      isCorrection: false,
    });
    expect(negative).toBeGreaterThan(neutral);
  });

  it("more references increases importance (log scale)", () => {
    const noRefs = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const manyRefs = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 15,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    expect(manyRefs).toBeGreaterThan(noRefs);
  });

  it("higher recency increases importance", () => {
    const old = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.1,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const recent = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.9,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    expect(recent).toBeGreaterThan(old);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/memory && npx vitest run src/__tests__/importance.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write importance scoring**

Create `packages/memory/src/importance.ts`:

```typescript
export interface ImportanceInput {
  baseWeight: number;       // 0-1
  recencyFactor: number;    // 0-1 (1 = just happened, 0 = very old)
  refCount: number;         // Number of references
  outcomeSignal: number;    // -1 to 1
  isCorrection: boolean;
}

// Weights — can be made configurable later
const W_BASE = 1.0;
const W_RECENCY = 1.5;
const W_REFS = 0.8;
const W_OUTCOME = 2.0;
const W_CORRECTION = 2.5;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compute importance score for a memory entry.
 * Returns a value between 0 and 1.
 *
 * Formula: sigmoid(
 *   w_base × base_weight
 * + w_recency × recency_factor
 * + w_refs × log₂(ref_count + 1)
 * + w_outcome × |outcome_signal|
 * + w_correction × is_correction
 * )
 *
 * Note: |outcome_signal| — both success and failure are valuable.
 */
export function computeImportance(input: ImportanceInput): number {
  const raw =
    W_BASE * input.baseWeight +
    W_RECENCY * input.recencyFactor +
    W_REFS * Math.log2(input.refCount + 1) +
    W_OUTCOME * Math.abs(input.outcomeSignal) +
    W_CORRECTION * (input.isCorrection ? 1 : 0);

  // Center the sigmoid so that average inputs give ~0.5
  return sigmoid(raw - 3.0);
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/memory && npx vitest run src/__tests__/importance.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Update memory index.ts**

Update `packages/memory/src/index.ts`:

```typescript
export { Vault } from "./vault";
export { NeuroclawDB } from "./sqlite";
export { WorkingMemory } from "./working-memory";
export { computeImportance, type ImportanceInput } from "./importance";
```

- [ ] **Step 6: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): add importance scoring with sigmoid formula"
```

---

## Task 12: Retrieval Engine (FTS5 + Query Classification)

**Files:**
- Create: `packages/memory/src/retrieval.ts`
- Create: `packages/memory/src/__tests__/retrieval.test.ts`

- [ ] **Step 1: Write the retrieval test**

Create `packages/memory/src/__tests__/retrieval.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { RetrievalEngine, classifyQuery } from "../retrieval";

describe("classifyQuery", () => {
  it("classifies short simple queries as text_search", () => {
    expect(classifyQuery("authentication")).toBe("text_search");
    expect(classifyQuery("TypeScript patterns")).toBe("text_search");
  });

  it("classifies relational queries as graph_walk", () => {
    expect(
      classifyQuery("how does authentication relate to the API layer")
    ).toBe("graph_walk");
    expect(
      classifyQuery("what connects the payment system to user profiles")
    ).toBe("graph_walk");
  });

  it("classifies multi-domain queries as graph_walk", () => {
    expect(
      classifyQuery("compare the testing approach in frontend and backend security modules")
    ).toBe("graph_walk");
  });
});

describe("RetrievalEngine", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let engine: RetrievalEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-retrieval-"));
    vault = new Vault(tmpDir);
    vault.init();
    db = new NeuroclawDB(path.join(tmpDir, "index.db"));
    engine = new RetrievalEngine(db, vault);

    // Seed test data
    const now = Date.now();
    db.insertSemantic({
      id: "sem-001",
      domain: "typescript",
      created: now,
      last_accessed: now,
      importance: 0.8,
      ref_count: 3,
      confidence: 0.9,
      file_path: "semantic/domains/ts.md",
      line_range: null,
    });
    vault.write("semantic/domains/ts.md", "# TypeScript\nBarrel exports are the convention in this project.");
    db.indexContent("sem-001", "semantic", "TypeScript barrel exports are the convention in this project");

    db.insertSemantic({
      id: "sem-002",
      domain: "testing",
      created: now,
      last_accessed: now,
      importance: 0.6,
      ref_count: 1,
      confidence: 0.7,
      file_path: "semantic/domains/testing.md",
      line_range: null,
    });
    vault.write("semantic/domains/testing.md", "# Testing\nIntegration tests hit real DB, not mocks.");
    db.indexContent("sem-002", "semantic", "Integration tests hit real DB not mocks");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("searches by text and returns memories with content", () => {
    const results = engine.search("barrel exports");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("sem-001");
    expect(results[0].content).toContain("Barrel exports");
    expect(results[0].source).toBe("semantic/domains/ts.md");
  });

  it("returns empty array for no matches", () => {
    const results = engine.search("kubernetes networking");
    expect(results).toHaveLength(0);
  });

  it("includes citation info in results", () => {
    const results = engine.search("integration tests");
    expect(results[0].source).toBe("semantic/domains/testing.md");
    expect(results[0].created).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/memory && npx vitest run src/__tests__/retrieval.test.ts`

Expected: FAIL.

- [ ] **Step 3: Write the retrieval engine**

Create `packages/memory/src/retrieval.ts`:

```typescript
import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";
import type { RetrievedMemory } from "@neuroclaw/core";

type QueryType = "text_search" | "graph_walk";

const RELATIONAL_TERMS = [
  "related to",
  "relates to",
  "similar to",
  "influenced by",
  "compared with",
  "connects to",
  "connection between",
  "how does",
  "what connects",
];

/**
 * Classify a query as text_search or graph_walk.
 * Heuristic: relational terms or length > 8 tokens with multi-domain markers → graph_walk.
 */
export function classifyQuery(query: string): QueryType {
  const lower = query.toLowerCase();
  const tokens = query.split(/\s+/);

  // Check for relational terms
  for (const term of RELATIONAL_TERMS) {
    if (lower.includes(term)) return "graph_walk";
  }

  // Long query with multiple domain-like terms suggests associative
  if (tokens.length > 8) {
    const domainTerms = ["frontend", "backend", "api", "database", "auth", "security", "testing", "deploy"];
    const domainCount = domainTerms.filter((d) => lower.includes(d)).length;
    if (domainCount >= 2) return "graph_walk";
  }

  return "text_search";
}

export class RetrievalEngine {
  private db: NeuroclawDB;
  private vault: Vault;

  constructor(db: NeuroclawDB, vault: Vault) {
    this.db = db;
    this.vault = vault;
  }

  search(query: string, limit: number = 10): RetrievedMemory[] {
    const queryType = classifyQuery(query);

    if (queryType === "graph_walk") {
      return this.graphWalkSearch(query, limit);
    }

    return this.textSearch(query, limit);
  }

  private textSearch(query: string, limit: number): RetrievedMemory[] {
    const ftsResults = this.db.searchFTS(query, limit);
    return this.hydrate(ftsResults);
  }

  private graphWalkSearch(query: string, limit: number): RetrievedMemory[] {
    // Phase 1: graph-walk retrieval will be implemented fully in Phase 2
    // For now, fall back to text search (the graph walk requires the relations
    // table to be populated, which happens during consolidation)
    return this.textSearch(query, limit);
  }

  private hydrate(
    ftsResults: Array<{ source_id: string; source_type: string; rank: number }>
  ): RetrievedMemory[] {
    const memories: RetrievedMemory[] = [];

    for (const result of ftsResults) {
      const record = this.db.getSemantic(result.source_id);
      if (!record) continue;

      const content = this.vault.read(record.file_path);
      if (!content) continue;

      memories.push({
        id: record.id,
        type: "semantic",
        content,
        importance: record.importance,
        relevanceScore: Math.abs(result.rank), // FTS5 rank is negative (lower = better)
        source: record.file_path,
        created: record.created,
      });
    }

    return memories;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/memory && npx vitest run src/__tests__/retrieval.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Update memory index.ts**

Update `packages/memory/src/index.ts`:

```typescript
export { Vault } from "./vault";
export { NeuroclawDB } from "./sqlite";
export { WorkingMemory } from "./working-memory";
export { computeImportance, type ImportanceInput } from "./importance";
export { RetrievalEngine, classifyQuery } from "./retrieval";
```

- [ ] **Step 6: Commit**

```bash
git add packages/memory/
git commit -m "feat(memory): add retrieval engine with FTS5 search and query classification"
```

---

## Task 13: Core Engine + CLI

**Files:**
- Create: `packages/core/src/engine.ts`
- Create: `packages/core/src/cli.ts`
- Create: `packages/core/bin/neuroclaw.ts`
- Create: `packages/core/src/__tests__/engine.test.ts`

- [ ] **Step 1: Write the engine test**

Create `packages/core/src/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("NeuroclawEngine", () => {
  let tmpDir: string;
  let configDir: string;
  let engine: NeuroclawEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-engine-"));
    configDir = path.join(tmpDir, "config");
    fs.mkdirSync(configDir, { recursive: true });

    // Write minimal base config
    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: "test"\n  store_path: "${tmpDir.replace(/\\/g, "/")}/store/"\n`
    );

    engine = new NeuroclawEngine(configDir);
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("initializes vault, database, and governance", () => {
    engine.init();
    const storeDir = path.join(tmpDir, "store");
    expect(fs.existsSync(path.join(storeDir, "working.md"))).toBe(true);
    expect(fs.existsSync(path.join(storeDir, "index.db"))).toBe(true);
  });

  it("loads working memory", () => {
    engine.init();
    const wm = engine.getWorkingMemory();
    expect(wm).toContain("Working Memory");
  });

  it("searches memory (returns empty for fresh instance)", () => {
    engine.init();
    const results = engine.search("test query");
    expect(results).toEqual([]);
  });

  it("exposes config", () => {
    engine.init();
    const config = engine.getConfig();
    expect(config.agent.id).toBe("test");
    expect(config.governance.mode).toBe("supervised");
  });

  it("exposes governance mode", () => {
    engine.init();
    expect(engine.getGovernanceMode()).toBe("supervised");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run`

Expected: FAIL.

- [ ] **Step 3: Write the engine**

Create `packages/core/src/engine.ts`:

```typescript
import * as path from "node:path";
import { loadConfig, resolveStorePath, type NeuroclawConfig } from "@neuroclaw/config";
import { Vault, NeuroclawDB, WorkingMemory, RetrievalEngine } from "@neuroclaw/memory";
import { GovernanceGate, AuditTrail, SecurityScanner } from "@neuroclaw/governance";
import type { GovernanceMode, RetrievedMemory } from "./types";

export class NeuroclawEngine {
  private config: NeuroclawConfig;
  private vault!: Vault;
  private db!: NeuroclawDB;
  private workingMemory!: WorkingMemory;
  private retrieval!: RetrievalEngine;
  private governance!: GovernanceGate;
  private audit!: AuditTrail;
  private scanner!: SecurityScanner;
  private storePath!: string;

  constructor(configDir: string, agentId?: string) {
    this.config = loadConfig(configDir, agentId);
  }

  init(): void {
    this.storePath = resolveStorePath(
      this.config.agent.store_path,
      this.config.agent.id
    );

    // Initialize vault
    this.vault = new Vault(this.storePath);
    this.vault.init();

    // Initialize database
    const dbPath = path.join(this.storePath, "index.db");
    this.db = new NeuroclawDB(dbPath);

    // Initialize subsystems
    this.workingMemory = new WorkingMemory(
      this.vault,
      this.config.memory.working_memory_max_lines
    );
    this.retrieval = new RetrievalEngine(this.db, this.vault);
    this.governance = new GovernanceGate(this.config.governance.mode);

    // Initialize governance
    const governanceDir = path.join(this.storePath, "governance");
    this.audit = new AuditTrail(
      path.join(governanceDir, "audit-trail.md")
    );
    this.scanner = new SecurityScanner(this.config.security);
  }

  getConfig(): NeuroclawConfig {
    return this.config;
  }

  getWorkingMemory(): string {
    return this.workingMemory.load();
  }

  search(query: string, limit?: number): RetrievedMemory[] {
    return this.retrieval.search(query, limit);
  }

  getGovernanceMode(): GovernanceMode {
    return this.governance.getMode();
  }

  getScanner(): SecurityScanner {
    return this.scanner;
  }

  getAudit(): AuditTrail {
    return this.audit;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
```

- [ ] **Step 4: Write the CLI**

Create `packages/core/src/cli.ts`:

```typescript
import { Command } from "commander";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "./engine";

function getDefaultConfigDir(): string {
  return path.join(os.homedir(), "neuroclaw", "config");
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("neuroclaw")
    .description("NeuroClaw — Self-improving agent memory engine")
    .version("0.1.0");

  // neuroclaw init
  program
    .command("init")
    .description("Initialize NeuroClaw (first-run wizard)")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .action((opts) => {
      console.log("NeuroClaw initialization wizard");
      console.log(`Config directory: ${opts.configDir}`);
      console.log("(Full wizard will be implemented in a future task)");
    });

  // neuroclaw config show
  const configCmd = program
    .command("config")
    .description("Manage configuration");

  configCmd
    .command("show")
    .description("Display resolved configuration")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID for agent-specific config")
    .action((opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        const config = engine.getConfig();
        console.log(JSON.stringify(config, null, 2));
      } catch (err: any) {
        console.error(`Error loading config: ${err.message}`);
        process.exit(1);
      }
    });

  // neuroclaw search
  program
    .command("search <query>")
    .description("Search memory")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .option("--limit <n>", "Max results", "10")
    .action((query, opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        engine.init();
        const results = engine.search(query, parseInt(opts.limit));

        if (results.length === 0) {
          console.log("No memories found.");
          return;
        }

        for (const mem of results) {
          console.log(`\n--- ${mem.source} (importance: ${mem.importance.toFixed(2)}) ---`);
          console.log(mem.content.slice(0, 200));
        }

        engine.close();
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  // neuroclaw status
  program
    .command("status")
    .description("Show health metrics")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .action((opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        engine.init();
        const config = engine.getConfig();
        console.log(`Agent: ${config.agent.id}`);
        console.log(`Governance: ${engine.getGovernanceMode()}`);
        console.log(`Store: ${config.agent.store_path}`);
        console.log("(Full health metrics will be implemented with dream cycle)");
        engine.close();
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  return program;
}
```

- [ ] **Step 5: Create the bin entry point**

Create `packages/core/bin/neuroclaw.ts`:

```typescript
#!/usr/bin/env node
import { createCLI } from "../src/cli";

createCLI().parse(process.argv);
```

- [ ] **Step 6: Update core index.ts**

```typescript
export * from "./types";
export { NeuroclawEngine } from "./engine";
export { createCLI } from "./cli";
```

- [ ] **Step 7: Run tests**

Run: `cd packages/core && npx vitest run`

Expected: all tests PASS.

- [ ] **Step 8: Build and verify CLI**

Run: `npm run build && node packages/core/bin/neuroclaw.ts --help`

Expected: Shows help text with `init`, `config`, `search`, `status` commands.

- [ ] **Step 9: Commit**

```bash
git add packages/core/
git commit -m "feat(core): add NeuroclawEngine orchestrator and CLI with init/config/search/status"
```

---

## Task 14: Adapter Stubs

**Files:**
- Create: `packages/adapter-openclaw/src/index.ts`
- Create: `packages/adapter-openclaw/src/detect.ts`
- Create: `packages/adapter-claude-code/src/index.ts`
- Create: `packages/adapter-claude-code/src/detect.ts`

- [ ] **Step 1: Write OpenClaw adapter stub**

Create `packages/adapter-openclaw/src/detect.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformInfo } from "@neuroclaw/core";

export function detectOpenClaw(workDir: string): PlatformInfo | null {
  const markers = ["AGENTS.md", "SOUL.md", "HEARTBEAT.md"];
  const found = markers.filter((m) =>
    fs.existsSync(path.join(workDir, m))
  );

  if (found.length === 0) return null;

  const nativeMemoryPath = fs.existsSync(path.join(workDir, "memory"))
    ? "memory/"
    : undefined;

  return {
    platform: "openclaw",
    workspaceFiles: found,
    nativeMemoryPath,
  };
}
```

Create `packages/adapter-openclaw/src/index.ts`:

```typescript
import type {
  NeuroclawAdapter,
  SessionContext,
  ActionContext,
  InjectedMemory,
  ActionResult,
  DreamSchedule,
  DreamReport,
  RetrievedMemory,
  PlatformInfo,
} from "@neuroclaw/core";
import { detectOpenClaw } from "./detect";

export class OpenClawAdapter implements NeuroclawAdapter {
  async onSessionStart(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — load SOUL.md, sync with identity, inject into AGENTS.md
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — finalize episode
  }

  async beforeAction(_context: ActionContext): Promise<InjectedMemory> {
    // TODO: Phase 5 — retrieval, working memory injection
    return { workingMemory: "", retrievedMemories: [] };
  }

  async afterAction(
    _context: ActionContext,
    _result: ActionResult
  ): Promise<void> {
    // TODO: Phase 5 — episodic capture, correction detection
  }

  async scheduleDream(_config: DreamSchedule): Promise<void> {
    // TODO: Phase 5 — write to HEARTBEAT.md
  }

  async executeDream(): Promise<DreamReport> {
    // TODO: Phase 2 + 5 — full dream cycle
    return {
      timestamp: Date.now(),
      episodesProcessed: 0,
      consolidated: 0,
      archived: 0,
      hypothesesUpdated: [],
      capabilityChanges: [],
      healthScore: 0,
      securityFindings: [],
      digestPath: "",
    };
  }

  injectIntoPrompt(_memories: RetrievedMemory[]): string {
    // TODO: Phase 5 — format for AGENTS.md injection
    return "";
  }

  detectPlatform(): PlatformInfo {
    return detectOpenClaw(process.cwd()) ?? {
      platform: "openclaw",
      workspaceFiles: [],
    };
  }
}

export { detectOpenClaw };
```

- [ ] **Step 2: Write Claude Code adapter stub**

Create `packages/adapter-claude-code/src/detect.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformInfo } from "@neuroclaw/core";

export function detectClaudeCode(workDir: string): PlatformInfo | null {
  const markers = ["CLAUDE.md", ".claude"];
  const found = markers.filter((m) =>
    fs.existsSync(path.join(workDir, m))
  );

  if (found.length === 0) return null;

  const claudeMemoryDir = path.join(workDir, ".claude", "memory");
  const nativeMemoryPath = fs.existsSync(claudeMemoryDir)
    ? ".claude/memory/"
    : undefined;

  return {
    platform: "claude_code",
    workspaceFiles: found,
    nativeMemoryPath,
  };
}
```

Create `packages/adapter-claude-code/src/index.ts`:

```typescript
import type {
  NeuroclawAdapter,
  SessionContext,
  ActionContext,
  InjectedMemory,
  ActionResult,
  DreamSchedule,
  DreamReport,
  RetrievedMemory,
  PlatformInfo,
} from "@neuroclaw/core";
import { detectClaudeCode } from "./detect";

export class ClaudeCodeAdapter implements NeuroclawAdapter {
  async onSessionStart(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — load CLAUDE.md, inject managed section
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — finalize episode
  }

  async beforeAction(_context: ActionContext): Promise<InjectedMemory> {
    // TODO: Phase 5 — retrieval, working memory injection
    return { workingMemory: "", retrievedMemories: [] };
  }

  async afterAction(
    _context: ActionContext,
    _result: ActionResult
  ): Promise<void> {
    // TODO: Phase 5 — episodic capture, correction detection
  }

  async scheduleDream(_config: DreamSchedule): Promise<void> {
    // TODO: Phase 5 — scheduled trigger setup
  }

  async executeDream(): Promise<DreamReport> {
    // TODO: Phase 2 + 5 — full dream cycle
    return {
      timestamp: Date.now(),
      episodesProcessed: 0,
      consolidated: 0,
      archived: 0,
      hypothesesUpdated: [],
      capabilityChanges: [],
      healthScore: 0,
      securityFindings: [],
      digestPath: "",
    };
  }

  injectIntoPrompt(_memories: RetrievedMemory[]): string {
    // TODO: Phase 5 — format for CLAUDE.md managed section
    return "";
  }

  detectPlatform(): PlatformInfo {
    return detectClaudeCode(process.cwd()) ?? {
      platform: "claude_code",
      workspaceFiles: [],
    };
  }
}

export { detectClaudeCode };
```

- [ ] **Step 3: Build all**

Run: `npm run build`

Expected: all packages compile successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/adapter-openclaw/ packages/adapter-claude-code/
git commit -m "feat(adapters): add OpenClaw and Claude Code adapter stubs with platform detection"
```

---

## Task 15: Integration Test — Full Init + Search Flow

**Files:**
- Create: `packages/core/src/__tests__/integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/core/src/__tests__/integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawEngine } from "../engine";

describe("Integration: full init + search flow", () => {
  let tmpDir: string;
  let configDir: string;
  let storeDir: string;
  let engine: NeuroclawEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-integration-"));
    configDir = path.join(tmpDir, "config");
    storeDir = path.join(tmpDir, "store");
    fs.mkdirSync(configDir, { recursive: true });

    fs.writeFileSync(
      path.join(configDir, "base.yaml"),
      `agent:\n  id: "integration-test"\n  store_path: "${storeDir.replace(/\\/g, "/")}"\n`
    );

    engine = new NeuroclawEngine(configDir);
    engine.init();
  });

  afterEach(() => {
    engine.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates vault structure, database, and governance files", () => {
    // Vault
    expect(fs.existsSync(path.join(storeDir, "working.md"))).toBe(true);
    expect(fs.existsSync(path.join(storeDir, "self-model", "identity.md"))).toBe(true);
    expect(fs.existsSync(path.join(storeDir, "episodic"))).toBe(true);

    // Database
    expect(fs.existsSync(path.join(storeDir, "index.db"))).toBe(true);

    // Config is loaded
    expect(engine.getConfig().agent.id).toBe("integration-test");
    expect(engine.getGovernanceMode()).toBe("supervised");
  });

  it("search returns empty for fresh instance", () => {
    const results = engine.search("anything");
    expect(results).toEqual([]);
  });

  it("working memory is loaded", () => {
    const wm = engine.getWorkingMemory();
    expect(wm).toContain("Working Memory");
  });

  it("security scanner blocks API keys", () => {
    const scanner = engine.getScanner();
    const result = scanner.scan("Here is my key: sk-proj-abc123def456ghi789");
    expect(result.blocked).toBe(true);
  });

  it("security scanner passes clean text", () => {
    const scanner = engine.getScanner();
    const result = scanner.scan("This is a normal memory about TypeScript patterns.");
    expect(result.blocked).toBe(false);
  });

  it("identity.md has CORE and MUTABLE sections", () => {
    const identity = fs.readFileSync(
      path.join(storeDir, "self-model", "identity.md"),
      "utf-8"
    );
    expect(identity).toContain("<!-- CORE -->");
    expect(identity).toContain("<!-- MUTABLE -->");
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd packages/core && npx vitest run src/__tests__/integration.test.ts`

Expected: all tests PASS.

- [ ] **Step 3: Run all tests across the monorepo**

Run: `npm run test`

Expected: all tests across all packages PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/__tests__/integration.test.ts
git commit -m "test(core): add integration test for full init + search flow"
```

---

## Summary

Phase 1 delivers:

- **Monorepo scaffolding** — Turborepo, TypeScript, Vitest, 8 package shells
- **@neuroclaw/core** — shared types, engine orchestrator, CLI (`neuroclaw init/config/search/status`)
- **@neuroclaw/config** — Zod schema, layered YAML loader (base → platform → user → agent), base.yaml
- **@neuroclaw/memory** — vault (markdown CRUD), SQLite (all tables + FTS5), working memory manager, importance scoring, retrieval engine (FTS5 + query classification)
- **@neuroclaw/governance** — security scanner (pre-write, always-block + configurable PII), governance mode enforcement, audit trail, invariant checks
- **Adapter stubs** — OpenClaw and Claude Code with platform detection

**What's ready for Phase 2:**
- Consolidation package can use the vault + SQLite + FTS5 + importance scoring
- Self-model package can use the vault + governance for evolution proposals
- Dream cycle can use the retrieval engine for probe-QA verification

**What's deferred:**
- Graph-walk retrieval (PageRank) — needs relations populated by consolidation
- Full wizard interactive flow — deferred to when adapters are complete
- Config CLI commands beyond `show` — `set`, `diff`, `validate`, `reset`, `export`
