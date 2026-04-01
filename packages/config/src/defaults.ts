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
