import type { EpisodeRecord, SemanticRecord } from "@neuroclaw/config";

// -- Public Types --

export interface ReplayJudgment {
  relation: "supports" | "contradicts" | "novel";
  confidence: number; // 0.0-1.0
  reasoning: string;
}

export interface DistillationResult {
  generalization: string;
  domain: string;
  tags: string[];
}

export interface DreamReasoner {
  judgeReplay(
    episode: EpisodeRecord,
    episodeContent: string,
    semanticEntry: SemanticRecord,
    semanticContent: string
  ): Promise<ReplayJudgment>;
  distill(
    episode: EpisodeRecord,
    episodeContent: string
  ): Promise<DistillationResult>;
}

export type LLMCallFn = (prompt: string) => Promise<string>;

// -- Domain extraction helpers --

const KNOWN_DOMAINS = [
  "auth",
  "api",
  "testing",
  "deployment",
  "database",
  "frontend",
  "security",
  "config",
  "cli",
  "memory",
] as const;

/**
 * Attempts to extract a domain name from content.
 *
 * Strategy:
 * 1. Path-based: look for `src/`, `lib/`, or `packages/` followed by a directory segment.
 * 2. Keyword: scan content for any known domain keyword.
 * 3. Default: "general".
 *
 * Returns `{ domain, tags }` where `tags` contains every matched keyword.
 */
function extractDomain(content: string): { domain: string; tags: string[] } {
  // 1. Path-based extraction
  const pathMatch = content.match(/(?:src|lib|packages)\/([^/\s]+)/);
  if (pathMatch) {
    const segment = pathMatch[1].toLowerCase();
    // Collect all keyword tags from content as well
    const tags = KNOWN_DOMAINS.filter((kw) =>
      content.toLowerCase().includes(kw)
    );
    return { domain: segment, tags };
  }

  // 2. Keyword matching
  const matched = KNOWN_DOMAINS.filter((kw) =>
    content.toLowerCase().includes(kw)
  );
  if (matched.length > 0) {
    return { domain: matched[0], tags: matched as unknown as string[] };
  }

  // 3. Default
  return { domain: "general", tags: [] };
}

// -- RuleBasedReasoner --

export class RuleBasedReasoner implements DreamReasoner {
  async judgeReplay(
    episode: EpisodeRecord,
    _episodeContent: string,
    _semanticEntry: SemanticRecord,
    _semanticContent: string
  ): Promise<ReplayJudgment> {
    if (episode.is_correction) {
      return {
        relation: "contradicts",
        confidence: 1.0,
        reasoning: "Episode is marked as a correction.",
      };
    }

    if (episode.outcome_signal > 0) {
      return {
        relation: "supports",
        confidence: 1.0,
        reasoning: "Episode has a positive outcome signal.",
      };
    }

    return {
      relation: "novel",
      confidence: 0.5,
      reasoning: "Episode has no correction flag and a non-positive outcome signal.",
    };
  }

  async distill(
    episode: EpisodeRecord,
    episodeContent: string
  ): Promise<DistillationResult> {
    const { domain, tags } = extractDomain(episodeContent);

    return {
      generalization: episode.summary,
      domain,
      tags,
    };
  }
}

// -- LLMReasoner --

export class LLMReasoner implements DreamReasoner {
  constructor(private readonly llm: LLMCallFn) {}

  async judgeReplay(
    episode: EpisodeRecord,
    episodeContent: string,
    semanticEntry: SemanticRecord,
    semanticContent: string
  ): Promise<ReplayJudgment> {
    const prompt = [
      `You are a memory consolidation reasoner. Given an episode and a semantic memory entry,`,
      `determine whether the episode supports, contradicts, or is novel relative to the semantic entry.`,
      ``,
      `Episode summary: ${episode.summary}`,
      `Episode content: ${episodeContent}`,
      ``,
      `Semantic entry domain: ${semanticEntry.domain}`,
      `Semantic content: ${semanticContent}`,
      ``,
      `Respond ONLY with valid JSON: { "relation": "supports"|"contradicts"|"novel", "confidence": 0.0-1.0, "reasoning": "..." }`,
    ].join("\n");

    try {
      const raw = await this.llm(prompt);
      const parsed = JSON.parse(raw) as Partial<ReplayJudgment>;
      if (
        parsed.relation &&
        ["supports", "contradicts", "novel"].includes(parsed.relation) &&
        typeof parsed.confidence === "number" &&
        typeof parsed.reasoning === "string"
      ) {
        return parsed as ReplayJudgment;
      }
    } catch {
      // fall through to rule-based fallback
    }

    // Graceful fallback
    const fallback = new RuleBasedReasoner();
    return fallback.judgeReplay(episode, episodeContent, semanticEntry, semanticContent);
  }

  async distill(
    episode: EpisodeRecord,
    episodeContent: string
  ): Promise<DistillationResult> {
    const prompt = [
      `You are a memory consolidation reasoner. Given an episode, produce a generalised semantic memory entry.`,
      ``,
      `Episode summary: ${episode.summary}`,
      `Episode content: ${episodeContent}`,
      ``,
      `Respond ONLY with valid JSON: { "generalization": "...", "domain": "...", "tags": ["..."] }`,
    ].join("\n");

    try {
      const raw = await this.llm(prompt);
      const parsed = JSON.parse(raw) as Partial<DistillationResult>;
      if (
        typeof parsed.generalization === "string" &&
        typeof parsed.domain === "string" &&
        Array.isArray(parsed.tags)
      ) {
        return parsed as DistillationResult;
      }
    } catch {
      // fall through to rule-based fallback
    }

    // Graceful fallback
    const fallback = new RuleBasedReasoner();
    return fallback.distill(episode, episodeContent);
  }
}
