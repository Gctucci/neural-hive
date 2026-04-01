import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformInfo } from "@neuroclaw/core";

export function detectOpenClaw(workDir: string): PlatformInfo | null {
  const markers = ["AGENTS.md", "SOUL.md", "HEARTBEAT.md"];
  const found = markers.filter((m) =>
    fs.existsSync(path.join(workDir, m))
  );

  if (found.length === 0) return null;

  return {
    platform: "openclaw",
    workspaceFiles: found,
  };
}
