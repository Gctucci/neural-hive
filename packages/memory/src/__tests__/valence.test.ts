import { describe, it, expect } from "vitest";
import { LocalValenceScorer, LLMValenceScorer } from "../valence";

describe("LocalValenceScorer", () => {
  const scorer = new LocalValenceScorer();

  it("returns source = 'local'", async () => {
    const result = await scorer.score("hello world");
    expect(result.source).toBe("local");
  });

  it("positive text gets positive valence", async () => {
    const result = await scorer.score("I love this! It's absolutely wonderful and amazing.");
    expect(result.valence).toBeGreaterThan(0);
  });

  it("negative text gets negative valence", async () => {
    const result = await scorer.score("This is terrible and awful. I hate it completely.");
    expect(result.valence).toBeLessThan(0);
  });

  it("neutral text scores near zero", async () => {
    // "The meeting starts at noon." is a factual, affect-free sentence
    const result = await scorer.score("The meeting starts at noon.");
    expect(result.valence).toBeGreaterThanOrEqual(-0.5);
    expect(result.valence).toBeLessThanOrEqual(0.5);
  });

  it("intense text has higher arousal than calm text", async () => {
    const calm = await scorer.score("okay that looks fine");
    const intense = await scorer.score("WHAT?! This is COMPLETELY WRONG!! How could this happen??");
    expect(intense.arousal).toBeGreaterThan(calm.arousal);
  });

  it("correction patterns force negative valence and boost arousal", async () => {
    const correction = await scorer.score("no that's wrong, you need to try again");
    expect(correction.valence).toBeLessThan(0);
    expect(correction.arousal).toBeGreaterThan(0.3);
  });

  it("'I told you' pattern forces negative valence", async () => {
    const result = await scorer.score("I told you this would fail");
    expect(result.valence).toBeLessThan(0);
  });

  it("praise patterns force positive valence", async () => {
    const praise = await scorer.score("perfect, great job on that one!");
    expect(praise.valence).toBeGreaterThan(0);
  });

  it("valence is always in [-1, 1]", async () => {
    const texts = [
      "I love this so much!!!",
      "TERRIBLE AWFUL HORRIBLE",
      "the quick brown fox jumps over the lazy dog",
      "no that's wrong try again immediately",
      "perfect! great job! absolutely wonderful!",
    ];
    for (const text of texts) {
      const result = await scorer.score(text);
      expect(result.valence).toBeGreaterThanOrEqual(-1);
      expect(result.valence).toBeLessThanOrEqual(1);
    }
  });

  it("arousal is always in [0, 1]", async () => {
    const texts = [
      "I love this so much!!!",
      "TERRIBLE AWFUL HORRIBLE",
      "the quick brown fox jumps over the lazy dog",
      "no that's wrong try again immediately",
      "perfect! great job! absolutely wonderful!",
    ];
    for (const text of texts) {
      const result = await scorer.score(text);
      expect(result.arousal).toBeGreaterThanOrEqual(0);
      expect(result.arousal).toBeLessThanOrEqual(1);
    }
  });
});

describe("LLMValenceScorer", () => {
  it("parses valid JSON from LLM response", async () => {
    const mockLLM = async (_prompt: string) =>
      JSON.stringify({ valence: 0.7, arousal: 0.5 });
    const scorer = new LLMValenceScorer(mockLLM);
    const result = await scorer.score("great work!");
    expect(result.valence).toBe(0.7);
    expect(result.arousal).toBe(0.5);
    expect(result.source).toBe("llm");
  });

  it("falls back to neutral on parse failure", async () => {
    const mockLLM = async (_prompt: string) => "not valid json at all";
    const scorer = new LLMValenceScorer(mockLLM);
    const result = await scorer.score("some text");
    expect(result.valence).toBe(0);
    expect(result.arousal).toBe(0.5);
    expect(result.source).toBe("llm");
  });

  it("clamps out-of-range LLM values to [-1,1] and [0,1]", async () => {
    const mockLLM = async (_prompt: string) =>
      JSON.stringify({ valence: 5.0, arousal: -2.0 });
    const scorer = new LLMValenceScorer(mockLLM);
    const result = await scorer.score("extreme text");
    expect(result.valence).toBe(1);
    expect(result.arousal).toBe(0);
    expect(result.source).toBe("llm");
  });
});
