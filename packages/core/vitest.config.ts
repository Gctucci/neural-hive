import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@neuroclaw/config": path.resolve(__dirname, "../config/src/index.ts"),
      "@neuroclaw/memory": path.resolve(__dirname, "../memory/src/index.ts"),
      "@neuroclaw/governance": path.resolve(__dirname, "../governance/src/index.ts"),
    },
  },
  test: {
    globals: true,
  },
});
