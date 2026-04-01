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
