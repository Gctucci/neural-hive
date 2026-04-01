import type {
  NeuroclawAdapter,
  SessionContext,
  ActionContext,
  InjectedMemory,
  ActionResult,
  DreamSchedule,
  DreamReport,
  RetrievedMemory,
  PlatformInfo,
} from "@neuroclaw/core";
import { detectClaudeCode } from "./detect";

export class ClaudeCodeAdapter implements NeuroclawAdapter {
  async onSessionStart(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — load CLAUDE.md, inject managed section
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // TODO: Phase 5 — finalize episode
  }

  async beforeAction(_context: ActionContext): Promise<InjectedMemory> {
    // TODO: Phase 5 — retrieval, working memory injection
    return { workingMemory: "", retrievedMemories: [] };
  }

  async afterAction(
    _context: ActionContext,
    _result: ActionResult
  ): Promise<void> {
    // TODO: Phase 5 — record outcome
  }

  async scheduleDream(_config: DreamSchedule): Promise<void> {
    // TODO: Phase 6 — dream cycle scheduling
  }

  async executeDream(): Promise<DreamReport> {
    // TODO: Phase 6 — dream cycle execution
    return {
      timestamp: Date.now(),
      episodesProcessed: 0,
      consolidated: 0,
      archived: 0,
      hypothesesUpdated: [],
      capabilityChanges: [],
      healthScore: 0,
      securityFindings: [],
      digestPath: "",
    };
  }

  injectIntoPrompt(_memories: RetrievedMemory[]): string {
    // TODO: Phase 5 — format retrieved memories for prompt injection
    return "";
  }

  detectPlatform(): PlatformInfo {
    return detectClaudeCode(process.cwd()) ?? {
      platform: "claude_code",
      workspaceFiles: [],
    };
  }
}

export { detectClaudeCode };
