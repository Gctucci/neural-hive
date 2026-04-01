import { describe, it, expect } from "vitest";
import { NeuroclawConfigSchema, type NeuroclawConfig } from "../schema";
import { DEFAULT_CONFIG } from "../defaults";

describe("NeuroclawConfigSchema", () => {
  it("validates the default config", () => {
    const result = NeuroclawConfigSchema.safeParse(DEFAULT_CONFIG);
    expect(result.success).toBe(true);
  });

  it("rejects invalid governance mode", () => {
    const bad = { ...DEFAULT_CONFIG, governance: { mode: "yolo" } };
    const result = NeuroclawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts partial config (everything optional except agent.id)", () => {
    const minimal = { agent: { id: "test" } };
    const result = NeuroclawConfigSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing fields", () => {
    const minimal = { agent: { id: "test" } };
    const result = NeuroclawConfigSchema.parse(minimal);
    expect(result.governance.mode).toBe("supervised");
    expect(result.memory.working_memory_max_lines).toBe(100);
    expect(result.security.sensitive_data).toBe("block");
  });

  it("rejects negative working_memory_max_lines", () => {
    const bad = {
      agent: { id: "test" },
      memory: { working_memory_max_lines: -1 },
    };
    const result = NeuroclawConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("validates forgetting unforgettable_categories is string array", () => {
    const config = {
      agent: { id: "test" },
      memory: {
        forgetting: {
          unforgettable_categories: ["corrections", "user_confirmed"],
        },
      },
    };
    const result = NeuroclawConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
