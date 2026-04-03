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
  // Citation fields (populated from DB on retrieval)
  sourceFile?: string;    // e.g. "MEMORY.md" extracted from tags
  domain?: string;        // e.g. "coding-preferences"
  createdAt?: number;     // raw ms timestamp
  citationLabel?: string; // e.g. "MEMORY.md · coding-preferences · 3d ago"
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

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "on",
  "at", "by", "for", "with", "about", "as", "into", "through", "from",
  "and", "or", "but", "not", "so", "yet", "both", "either", "neither",
  "how", "what", "why", "when", "where", "who", "which", "that", "this",
  "these", "those", "it", "its", "than", "then", "there", "their",
  "relate", "relates", "related", "relation", "relationship",
  "connect", "connects", "connected", "connection",
  "between", "links", "linked", "associate", "associated",
  "depends", "dependency", "compare", "contrast", "difference",
]);

/**
 * Extract FTS-friendly keywords from a query by stripping stop words and
 * relational/function words that won't appear in indexed content.
 * Returns an OR-joined query so documents matching any keyword are found.
 */
function extractKeywords(query: string): string {
  const tokens = query.toLowerCase().split(/\s+/);
  const keywords = tokens.filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return keywords.join(" OR ");
}

function parseCitationSource(tags: string): string | undefined {
  const parts = tags.split(",");
  const sourceTag = parts.find((t) => t.startsWith("source:"));
  return sourceTag ? sourceTag.slice("source:".length) : undefined;
}

function buildCitationLabel(
  sourceFile: string | undefined,
  domain: string,
  createdAt: number
): string {
  const daysAgo = Math.floor((Date.now() - createdAt) / 86_400_000);
  const age = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
  const src = sourceFile ?? domain;
  return `${src} · ${age}`;
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
    // Step 1: Seed selection — top 3 FTS results using keyword-extracted query
    // (strips stop words and relational terms so FTS MATCH succeeds)
    const ftsQuery = extractKeywords(query);
    if (!ftsQuery) return [];
    const seeds = this.db.searchFTS(ftsQuery, 3);
    if (seeds.length === 0) return [];

    const scored = new Map<string, { score: number; sourceType: string }>();

    // Score seeds
    for (const seed of seeds) {
      scored.set(seed.source_id, {
        score: Math.abs(seed.rank),
        sourceType: seed.source_type,
      });
    }

    const DEPTH_DECAY = 0.7;

    // Walk up to 2 hops
    for (const seed of seeds) {
      const seedScore = Math.abs(seed.rank);

      // Hop 1
      const hop1 = [
        ...this.db.getRelationsFrom(seed.source_id),
        ...this.db.getRelationsTo(seed.source_id),
      ];

      for (const rel of hop1) {
        const neighborId = rel.source_id === seed.source_id ? rel.target_id : rel.source_id;
        const score = seedScore * rel.weight * DEPTH_DECAY;
        const existing = scored.get(neighborId);
        if (!existing || score > existing.score) {
          scored.set(neighborId, { score, sourceType: "semantic" });
        }

        // GSEM: increment edge weight for traversed hop-1 edge
        this.db.incrementEdgeWeight(
          rel.source_id,
          rel.target_id,
          rel.relation_type
        );

        // Hop 2
        const hop2 = [
          ...this.db.getRelationsFrom(neighborId),
          ...this.db.getRelationsTo(neighborId),
        ];

        for (const rel2 of hop2) {
          const neighbor2Id = rel2.source_id === neighborId ? rel2.target_id : rel2.source_id;
          if (neighbor2Id === seed.source_id) continue;
          const score2 = seedScore * rel.weight * rel2.weight * DEPTH_DECAY * DEPTH_DECAY;
          const existing2 = scored.get(neighbor2Id);
          if (!existing2 || score2 > existing2.score) {
            scored.set(neighbor2Id, { score: score2, sourceType: "semantic" });
          }

          // GSEM: increment edge weight for traversed hop-2 edge
          this.db.incrementEdgeWeight(
            rel2.source_id,
            rel2.target_id,
            rel2.relation_type
          );
        }
      }
    }

    // Rank and hydrate
    const sorted = [...scored.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);

    return this.hydrateScored(sorted);
  }

  private hydrateScored(
    entries: Array<[string, { score: number; sourceType: string }]>
  ): RetrievedMemory[] {
    const memories: RetrievedMemory[] = [];

    for (const [id, { score }] of entries) {
      const record = this.db.getSemantic(id);
      if (!record) continue;

      const content = this.vault.read(record.file_path);
      if (!content) continue;

      const sourceFile = parseCitationSource(record.tags ?? "");
      const citationLabel = buildCitationLabel(
        sourceFile,
        record.domain,
        record.created
      );

      memories.push({
        id: record.id,
        type: "semantic",
        content,
        importance: record.importance,
        relevanceScore: score,
        source: record.file_path,
        created: String(record.created),
        sourceFile,
        domain: record.domain,
        createdAt: record.created,
        citationLabel,
      });
    }

    return memories;
  }

  private hydrate(
    ftsResults: Array<{ source_id: string; source_type: string; rank: number }>
  ): RetrievedMemory[] {
    return this.hydrateScored(
      ftsResults.map((r) => [r.source_id, { score: Math.abs(r.rank), sourceType: r.source_type }])
    );
  }
}
