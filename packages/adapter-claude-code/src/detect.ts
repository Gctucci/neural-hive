import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformInfo } from "@neuroclaw/core";

export function detectClaudeCode(workDir: string): PlatformInfo | null {
  const markers = ["CLAUDE.md", ".claude"];
  const found = markers.filter((m) =>
    fs.existsSync(path.join(workDir, m))
  );

  if (found.length === 0) return null;

  const claudeMemoryDir = path.join(workDir, ".claude", "memory");
  const nativeMemoryPath = fs.existsSync(claudeMemoryDir)
    ? ".claude/memory/"
    : undefined;

  return {
    platform: "claude_code",
    workspaceFiles: found,
    nativeMemoryPath,
  };
}
