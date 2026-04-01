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

const ALWAYS_AUTO: Operation[] = [
  "episodic_capture",
  "working_memory_update",
  "correction_detection",
  "graph_edge_update",
];

const ALWAYS_APPROVE: Operation[] = ["config_change"];

const SUPERVISED_APPROVE: Operation[] = [
  "self_model_mutation",
  "hypothesis_promotion",
];

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
