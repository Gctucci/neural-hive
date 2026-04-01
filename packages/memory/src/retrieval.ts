import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";

export type QueryType = "text_search" | "graph_walk";

export interface RetrievedMemory {
  id: string;
  type: "semantic" | "episodic" | "working";
  content: string;
  importance: number;
  relevanceScore: number;
  source: string;
  created: string;
}

const RELATIONAL_TERMS = [
  "relate", "relates", "related", "relation", "relationship",
  "connect", "connects", "connected", "connection",
  "between", "links", "linked", "associate", "associated",
  "depends", "dependency", "how does", "what connects",
  "compare", "contrast", "difference between",
];

/**
 * Classify a query as text_search or graph_walk.
 * Heuristic: relational terms or length > 8 tokens with multi-domain markers → graph_walk.
 */
export function classifyQuery(query: string): QueryType {
  const lower = query.toLowerCase();
  const tokens = query.split(/\s+/);

  // Check for relational terms
  for (const term of RELATIONAL_TERMS) {
    if (lower.includes(term)) return "graph_walk";
  }

  // Long query with multiple domain-like terms suggests associative
  if (tokens.length > 8) {
    const domainTerms = ["frontend", "backend", "api", "database", "auth", "security", "testing", "deploy"];
    const domainCount = domainTerms.filter((d) => lower.includes(d)).length;
    if (domainCount >= 2) return "graph_walk";
  }

  return "text_search";
}

export class RetrievalEngine {
  private db: NeuroclawDB;
  private vault: Vault;

  constructor(db: NeuroclawDB, vault: Vault) {
    this.db = db;
    this.vault = vault;
  }

  search(query: string, limit: number = 10): RetrievedMemory[] {
    const queryType = classifyQuery(query);

    if (queryType === "graph_walk") {
      return this.graphWalkSearch(query, limit);
    }

    return this.textSearch(query, limit);
  }

  private textSearch(query: string, limit: number): RetrievedMemory[] {
    const ftsResults = this.db.searchFTS(query, limit);
    return this.hydrate(ftsResults);
  }

  private graphWalkSearch(query: string, limit: number): RetrievedMemory[] {
    // Phase 1: graph-walk retrieval will be fully implemented in Phase 2.
    // The graph walk requires the relations table to be populated during consolidation.
    // For now, fall back to text search.
    return this.textSearch(query, limit);
  }

  private hydrate(
    ftsResults: Array<{ source_id: string; source_type: string; rank: number }>
  ): RetrievedMemory[] {
    const memories: RetrievedMemory[] = [];

    for (const result of ftsResults) {
      const record = this.db.getSemantic(result.source_id);
      if (!record) continue;

      const content = this.vault.read(record.file_path);
      if (!content) continue;

      memories.push({
        id: record.id,
        type: "semantic",
        content,
        importance: record.importance,
        // FTS4 rank is a negative count; negate to get a positive relevance score
        relevanceScore: Math.abs(result.rank),
        source: record.file_path,
        created: String(record.created),
      });
    }

    return memories;
  }
}
