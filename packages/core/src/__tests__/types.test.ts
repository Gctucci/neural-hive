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
  });

  it("SessionContext requires platform and directory", () => {
    const ctx: SessionContext = {
      sessionId: "s-1",
      agentId: "default",
      platform: "openclaw",
      workingDirectory: "/tmp/test",
    };
    expect(ctx.platform).toBe("openclaw");
  });

  it("ActionContext extends SessionContext", () => {
    const ctx: ActionContext = {
      sessionId: "s-1",
      agentId: "default",
      platform: "claude_code",
      workingDirectory: "/tmp/test",
      messageHistory: ["hello"],
      loadedMemories: [],
    };
    expect(ctx.messageHistory).toHaveLength(1);
  });
});
