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

const ValenceSchema = z.object({
  scorer: z.enum(["local", "llm"]).default("local"),
  llm_provider: z.string().nullable().default(null),
});

const MemorySchema = z.object({
  working_memory_max_lines: z.number().positive().default(100),
  episodic: EpisodicSchema.default({}),
  procedural: ProceduralSchema.default({}),
  forgetting: ForgettingSchema.default({}),
  valence: ValenceSchema.default({}),
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

const ReasonerSchema = z.object({
  type: z.enum(["rule", "llm"]).default("rule"),
  llm_provider: z.string().nullable().default(null),
});

const ConsolidationSchema = z.object({
  dream_cycle: DreamCycleSchema.default({}),
  verification: VerificationSchema.default({}),
  reasoner: ReasonerSchema.default({}),
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
