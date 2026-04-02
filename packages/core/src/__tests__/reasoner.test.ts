import { describe, it, expect, vi } from "vitest";
import type { EpisodeRecord, SemanticRecord } from "@neuroclaw/config";
import {
  RuleBasedReasoner,
  LLMReasoner,
} from "../reasoner";

// -- Helper factories --

function makeEpisode(overrides: Partial<EpisodeRecord> = {}): EpisodeRecord {
  return {
    id: "ep-test-1",
    timestamp: Date.now(),
    session_id: "session-1",
    project: "test-project",
    importance: 0.5,
    is_correction: false,
    outcome_signal: 0,
    consolidation_status: "pending",
    file_path: "vault/episodic/ep-test-1.md",
    summary: "A test episode summary.",
    valence: 0.0,
    arousal: 0.5,
    context_snippet: "some raw context text",
    ...overrides,
  };
}

function makeSemantic(overrides: Partial<SemanticRecord> = {}): SemanticRecord {
  return {
    id: "sem-test-1",
    domain: "general",
    created: Date.now(),
    last_accessed: Date.now(),
    importance: 0.5,
    ref_count: 1,
    confidence: 0.8,
    file_path: "vault/semantic/domains/general.md",
    line_range: null,
    half_life: 30,
    retention: 1.0,
    source_episode_ids: "ep-test-1",
    ...overrides,
  };
}

// -- RuleBasedReasoner tests --

describe("RuleBasedReasoner", () => {
  const reasoner = new RuleBasedReasoner();
  const semantic = makeSemantic();

  describe("judgeReplay", () => {
    it("returns 'contradicts' for correction episodes", async () => {
      const episode = makeEpisode({ is_correction: true });
      const result = await reasoner.judgeReplay(episode, "", semantic, "");

      expect(result.relation).toBe("contradicts");
      expect(result.confidence).toBe(1.0);
    });

    it("returns 'supports' for episodes with positive outcome signal", async () => {
      const episode = makeEpisode({ is_correction: false, outcome_signal: 1 });
      const result = await reasoner.judgeReplay(episode, "", semantic, "");

      expect(result.relation).toBe("supports");
      expect(result.confidence).toBe(1.0);
    });

    it("returns 'novel' for neutral episodes (no correction, non-positive outcome)", async () => {
      const episode = makeEpisode({ is_correction: false, outcome_signal: 0 });
      const result = await reasoner.judgeReplay(episode, "", semantic, "");

      expect(result.relation).toBe("novel");
      expect(result.confidence).toBe(0.5);
    });

    it("prefers 'contradicts' over 'supports' when both is_correction and positive outcome are set", async () => {
      const episode = makeEpisode({ is_correction: true, outcome_signal: 1 });
      const result = await reasoner.judgeReplay(episode, "", semantic, "");

      expect(result.relation).toBe("contradicts");
    });

    it("returns 'novel' for negative outcome signal without correction flag", async () => {
      const episode = makeEpisode({ is_correction: false, outcome_signal: -1 });
      const result = await reasoner.judgeReplay(episode, "", semantic, "");

      expect(result.relation).toBe("novel");
      expect(result.confidence).toBe(0.5);
    });
  });

  describe("distill", () => {
    it("returns the episode summary as the generalization", async () => {
      const episode = makeEpisode({ summary: "Always validate user input." });
      const result = await reasoner.distill(episode, "some content");

      expect(result.generalization).toBe("Always validate user input.");
    });

    it("extracts domain from content containing a src/ file path", async () => {
      const episode = makeEpisode({ summary: "Auth token logic refined." });
      const result = await reasoner.distill(episode, "Modified src/auth/tokens.ts to fix expiry.");

      expect(result.domain).toBe("auth");
    });

    it("extracts domain from content containing a lib/ file path", async () => {
      const episode = makeEpisode({ summary: "API handler updated." });
      const result = await reasoner.distill(episode, "Changed lib/api/handler.ts.");

      expect(result.domain).toBe("api");
    });

    it("extracts domain from content containing a packages/ file path", async () => {
      const episode = makeEpisode({ summary: "Memory package updated." });
      const result = await reasoner.distill(episode, "Edited packages/memory/src/index.ts.");

      expect(result.domain).toBe("memory");
    });

    it("falls back to keyword matching when no path is present", async () => {
      const episode = makeEpisode({ summary: "Database query optimised." });
      const result = await reasoner.distill(episode, "Optimised database queries for performance.");

      expect(result.domain).toBe("database");
    });

    it("falls back to 'general' when no domain can be extracted", async () => {
      const episode = makeEpisode({ summary: "Misc refactor." });
      const result = await reasoner.distill(episode, "Some unrelated refactoring.");

      expect(result.domain).toBe("general");
      expect(result.tags).toEqual([]);
    });

    it("includes all matched keyword tags", async () => {
      const episode = makeEpisode({ summary: "Auth and security review." });
      const result = await reasoner.distill(
        episode,
        "Reviewed auth and security modules."
      );

      expect(result.tags).toContain("auth");
      expect(result.tags).toContain("security");
    });
  });
});

// -- LLMReasoner tests --

describe("LLMReasoner", () => {
  describe("judgeReplay", () => {
    it("parses a valid LLM JSON response", async () => {
      const llm = vi.fn().mockResolvedValue(
        JSON.stringify({ relation: "supports", confidence: 0.9, reasoning: "Consistent." })
      );
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ outcome_signal: 0 });
      const result = await reasoner.judgeReplay(episode, "content", makeSemantic(), "sem");

      expect(result.relation).toBe("supports");
      expect(result.confidence).toBe(0.9);
      expect(llm).toHaveBeenCalledOnce();
    });

    it("falls back to rule-based on invalid JSON", async () => {
      const llm = vi.fn().mockResolvedValue("not json at all");
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ is_correction: true });
      const result = await reasoner.judgeReplay(episode, "", makeSemantic(), "");

      // Rule-based fallback: correction → contradicts
      expect(result.relation).toBe("contradicts");
    });

    it("falls back to rule-based on LLM rejection (throws)", async () => {
      const llm = vi.fn().mockRejectedValue(new Error("LLM unavailable"));
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ outcome_signal: 1 });
      const result = await reasoner.judgeReplay(episode, "", makeSemantic(), "");

      expect(result.relation).toBe("supports");
    });
  });

  describe("distill", () => {
    it("parses a valid LLM JSON response", async () => {
      const llm = vi.fn().mockResolvedValue(
        JSON.stringify({ generalization: "Always use typed APIs.", domain: "api", tags: ["api"] })
      );
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ summary: "Use typed APIs." });
      const result = await reasoner.distill(episode, "content");

      expect(result.generalization).toBe("Always use typed APIs.");
      expect(result.domain).toBe("api");
      expect(llm).toHaveBeenCalledOnce();
    });

    it("falls back to rule-based on invalid JSON", async () => {
      const llm = vi.fn().mockResolvedValue("{ broken json");
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ summary: "Rule-based fallback summary." });
      const result = await reasoner.distill(episode, "src/auth/helpers.ts");

      // Rule-based fallback: summary preserved, domain from path
      expect(result.generalization).toBe("Rule-based fallback summary.");
      expect(result.domain).toBe("auth");
    });

    it("falls back to rule-based on LLM rejection (throws)", async () => {
      const llm = vi.fn().mockRejectedValue(new Error("timeout"));
      const reasoner = new LLMReasoner(llm);
      const episode = makeEpisode({ summary: "Timeout fallback." });
      const result = await reasoner.distill(episode, "no domain content");

      expect(result.generalization).toBe("Timeout fallback.");
      expect(result.domain).toBe("general");
    });
  });
});
