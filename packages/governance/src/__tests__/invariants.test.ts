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
