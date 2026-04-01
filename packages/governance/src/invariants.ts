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
