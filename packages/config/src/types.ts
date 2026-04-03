// -- Enums / Union Types --

export type GovernanceMode = "autonomous" | "supervised" | "gated";
export type MemoryType = "episodic" | "semantic" | "procedural" | "working";
export type ConsolidationStatus =
  | "pending"
  | "consolidated"
  | "migrated"
  | "archived";
export type RelationType =
  | "supports"
  | "contradicts"
  | "elaborates"
  | "requires";
export type HypothesisStatus =
  | "tentative"
  | "confirmed"
  | "demoted"
  | "revoked"
  | "stale";

// -- Session & Action --

export interface SessionContext {
  sessionId: string;
  agentId: string;
  platform: "openclaw" | "claude_code";
  workingDirectory: string;
  projectName?: string;
}

export interface ActionContext extends SessionContext {
  messageHistory: string[];
  loadedMemories: RetrievedMemory[];
}

export interface ActionResult {
  success: boolean;
  toolUsed?: string;
  outputSummary?: string;
  isCorrection: boolean;
}

// -- Memory Records --

export interface RetrievedMemory {
  id: string;
  type: Exclude<MemoryType, "working">;
  content: string;
  importance: number;
  relevanceScore: number;
  source: string;
  created: number;
  evidenceChain?: string[];
}

export interface InjectedMemory {
  workingMemory: string;
  retrievedMemories: RetrievedMemory[];
  capabilityContext?: string;
}

export interface EpisodeRecord {
  id: string;
  timestamp: number;
  session_id: string;
  project: string | null;
  importance: number;
  is_correction: boolean;
  outcome_signal: number;
  consolidation_status: ConsolidationStatus;
  file_path: string;
  summary: string;
  valence: number;         // -1.0 to +1.0
  arousal: number;         // 0.0 to 1.0
  context_snippet: string; // raw text that triggered the valence score
}

export interface SemanticRecord {
  id: string;
  domain: string;
  created: number;
  last_accessed: number;
  importance: number;
  ref_count: number;
  confidence: number;
  file_path: string;
  line_range: string | null;
  half_life: number;          // days
  retention: number;          // 0.0-1.0
  source_episode_ids: string; // comma-separated episode IDs
  tags: string;               // comma-separated, e.g. "migration,source:MEMORY.md"
}

export interface ProcedureRecord {
  id: string;
  name: string;
  task_type: string;
  success_count: number;
  last_used: number;
  file_path: string;
}

export interface RelationRecord {
  source_id: string;
  target_id: string;
  relation_type: RelationType;
  weight: number;
  created: number;
  last_used: number;
  provenance: "rule" | "llm";
  confidence: number;         // 0.0-1.0
}

export interface HypothesisRecord {
  id: string;
  claim: string;
  evidence_for: number;
  evidence_against: number;
  status: HypothesisStatus;
  created: number;
  last_tested: number;
  outcome_score: number;
}

// -- Dream Cycle --

export interface DreamSchedule {
  frequency: "daily" | "on_demand";
  hour: number;
  staggerOffset?: number;
}

export interface DreamReport {
  timestamp: number;
  episodesProcessed: number;
  consolidated: number;
  archived: number;
  hypothesesUpdated: string[];
  capabilityChanges: string[];
  healthScore: number;
  securityFindings: string[];
  digestPath: string;
}

// -- Platform --

export interface PlatformInfo {
  platform: "openclaw" | "claude_code";
  workspaceFiles: string[];
  nativeMemoryPath?: string;
}

// -- Adapter Interface --

export interface NeuroclawAdapter {
  onSessionStart(context: SessionContext): Promise<void>;
  onSessionEnd(context: SessionContext): Promise<void>;
  beforeAction(context: ActionContext): Promise<InjectedMemory>;
  afterAction(
    context: ActionContext,
    result: ActionResult
  ): Promise<void>;
  scheduleDream(config: DreamSchedule): Promise<void>;
  executeDream(): Promise<DreamReport>;
  injectIntoPrompt(memories: RetrievedMemory[]): string;
  detectPlatform(): PlatformInfo;
}
