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

  it("correction flag increases importance", () => {
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

  it("higher refCount increases importance", () => {
    const low = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 0,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    const high = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 0.5,
      refCount: 10,
      outcomeSignal: 0.0,
      isCorrection: false,
    });
    expect(high).toBeGreaterThan(low);
  });
});
