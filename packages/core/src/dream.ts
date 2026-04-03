import type {
  NeuroclawConfig,
  DreamReport,
  EpisodeRecord,
  SemanticRecord,
  RelationRecord,
} from "@neuroclaw/config";
import type { NeuroclawDB } from "@neuroclaw/memory";
import type { Vault } from "@neuroclaw/memory";
import type { GovernanceGate, AuditTrail } from "@neuroclaw/governance";
import type { DreamReasoner } from "./reasoner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortByReplayPriority(episodes: EpisodeRecord[]): EpisodeRecord[] {
  return [...episodes].sort((a, b) => {
    const scoreA = a.importance + Math.abs(a.valence) * 0.3;
    const scoreB = b.importance + Math.abs(b.valence) * 0.3;
    return scoreB - scoreA;
  });
}

function generateId(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function formatTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// DreamCycle
// ---------------------------------------------------------------------------

export class DreamCycle {
  private db: NeuroclawDB;
  private vault: Vault;
  private config: NeuroclawConfig;
  private gate: GovernanceGate;
  private audit: AuditTrail;
  private reasoner: DreamReasoner;

  constructor(
    db: NeuroclawDB,
    vault: Vault,
    config: NeuroclawConfig,
    gate: GovernanceGate,
    audit: AuditTrail,
    reasoner: DreamReasoner,
  ) {
    this.db = db;
    this.vault = vault;
    this.config = config;
    this.gate = gate;
    this.audit = audit;
    this.reasoner = reasoner;
  }

  // -----------------------------------------------------------------------
  // Main entry point
  // -----------------------------------------------------------------------

  async run(): Promise<DreamReport> {
    const now = Date.now();

    // -- Phase 1: Collection --
    const pending = sortByReplayPriority(this.db.getPendingEpisodes());

    if (pending.length === 0) {
      const emptyReport = this.buildReport(now, 0, 0, 0, [], [], []);
      return emptyReport;
    }

    // -- Phase 2: Replay --
    const hypothesesUpdated: string[] = [];
    const capabilityChanges: string[] = [];

    for (const episode of pending) {
      await this.replayEpisode(episode, hypothesesUpdated);
    }

    // -- Phase 3: Consolidation --
    for (const episode of pending) {
      this.db.updateEpisodeStatus(episode.id, "consolidated");
    }
    this.applyForgettingCurves(now);
    this.decayStaleEdges();

    // -- Phase 4: Self-Model Evolution --
    await this.evolveHypotheses(hypothesesUpdated, capabilityChanges);

    // -- Phase 5: Health Report --
    const archivedCount = this.archiveLowRetention();

    const report = this.buildReport(
      now,
      pending.length,
      pending.length,
      archivedCount,
      hypothesesUpdated,
      capabilityChanges,
      [],
    );

    // Write dream digest to vault
    this.writeDreamDigest(report, now);

    return report;
  }

  // -----------------------------------------------------------------------
  // Phase 2 — Replay
  // -----------------------------------------------------------------------

  private async replayEpisode(
    episode: EpisodeRecord,
    hypothesesUpdated: string[],
  ): Promise<void> {
    const episodeContent = this.vault.read(episode.file_path) ?? "";

    // FTS search the episode summary against semantic entries
    const ftsQuery = this.sanitizeFtsQuery(episode.summary);
    let ftsResults: Array<{ source_id: string; source_type: string; rank: number }> = [];
    if (ftsQuery.length > 0) {
      try {
        ftsResults = this.db.searchFTS(ftsQuery, 5);
      } catch {
        // FTS can fail on unusual query terms; treat as no matches
        ftsResults = [];
      }
    }

    // Filter strong matches (|rank| >= 3.0) with source_type "semantic"
    const strongMatches = ftsResults.filter(
      (r) => Math.abs(r.rank) >= 3.0 && r.source_type === "semantic",
    );

    if (strongMatches.length > 0) {
      for (const match of strongMatches) {
        const semanticEntry = this.db.getSemantic(match.source_id);
        if (!semanticEntry) continue;

        const semanticContent = this.vault.read(semanticEntry.file_path) ?? "";
        const judgment = await this.reasoner.judgeReplay(
          episode,
          episodeContent,
          semanticEntry,
          semanticContent,
        );

        if (judgment.relation === "supports") {
          this.db.incrementSemanticRefCount(semanticEntry.id);
          this.insertRelation(episode.id, semanticEntry.id, "supports", judgment.confidence);
        } else if (judgment.relation === "contradicts") {
          this.insertRelation(episode.id, semanticEntry.id, "contradicts", judgment.confidence);

          // Create a hypothesis about the contradiction
          const hypId = generateId("hyp");
          this.db.insertHypothesis({
            id: hypId,
            claim: `Contradiction: episode ${episode.id} contradicts semantic ${semanticEntry.id}`,
            evidence_for: 0,
            evidence_against: 1,
            status: "tentative",
            created: Date.now(),
            last_tested: Date.now(),
            outcome_score: 0,
          });
          hypothesesUpdated.push(hypId);
        } else {
          // "novel" judgment: FTS match was a false positive — treat as no strong match
          // and fall through to distillation below
          const distilled = await this.reasoner.distill(episode, episodeContent);

          const semId = generateId("sem");
          const baseHalfLife = this.config.memory.forgetting.decay_window_days;
          const halfLife = baseHalfLife + Math.abs(episode.valence) * baseHalfLife * 0.5;
          const filePath = `semantic/domains/${distilled.domain}.md`;

          const semContent = [
            `## ${distilled.generalization}`,
            "",
            `Domain: ${distilled.domain}`,
            `Tags: ${distilled.tags.join(", ") || "none"}`,
            `Source: ${episode.id}`,
            "",
          ].join("\n");

          this.vault.append(filePath, semContent);

          const semRecord: SemanticRecord = {
            id: semId,
            domain: distilled.domain,
            created: Date.now(),
            last_accessed: Date.now(),
            importance: episode.importance,
            ref_count: 0,
            confidence: 0.5,
            file_path: filePath,
            line_range: null,
            half_life: halfLife,
            retention: 1.0,
            source_episode_ids: episode.id,
            tags: "",
          };

          this.db.insertSemantic(semRecord);
          this.db.indexContent(semId, "semantic", distilled.generalization);
          this.insertRelation(episode.id, semId, "elaborates", 1.0);

          // Only handle one novel judgment per episode — break out of the match loop
          break;
        }
      }
    } else {
      // No strong matches — distill a new semantic entry
      const distilled = await this.reasoner.distill(episode, episodeContent);

      const semId = generateId("sem");
      const baseHalfLife = this.config.memory.forgetting.decay_window_days;
      const halfLife = baseHalfLife + Math.abs(episode.valence) * baseHalfLife * 0.5;
      const filePath = `semantic/domains/${distilled.domain}.md`;

      // Write content to vault
      const semContent = [
        `## ${distilled.generalization}`,
        "",
        `Domain: ${distilled.domain}`,
        `Tags: ${distilled.tags.join(", ") || "none"}`,
        `Source: ${episode.id}`,
        "",
      ].join("\n");

      this.vault.append(filePath, semContent);

      // Insert semantic record
      const semRecord: SemanticRecord = {
        id: semId,
        domain: distilled.domain,
        created: Date.now(),
        last_accessed: Date.now(),
        importance: episode.importance,
        ref_count: 0,
        confidence: 0.5,
        file_path: filePath,
        line_range: null,
        half_life: halfLife,
        retention: 1.0,
        source_episode_ids: episode.id,
        tags: "",
      };

      this.db.insertSemantic(semRecord);
      this.db.indexContent(semId, "semantic", distilled.generalization);

      // Insert "elaborates" relation from episode to new semantic
      this.insertRelation(episode.id, semId, "elaborates", 1.0);
    }

    // Audit log
    this.audit.log({
      operation: "dream_replay",
      component: "DreamCycle",
      description: `Replayed episode ${episode.id}`,
      evidence: [episode.summary],
    });
  }

  // -----------------------------------------------------------------------
  // Phase 3 — Forgetting Curves
  // -----------------------------------------------------------------------

  private applyForgettingCurves(now: number): void {
    if (!this.config.memory.forgetting.enabled) return;

    const allSemantic = this.db.getAllSemanticEntries();
    const unforgettable = this.config.memory.forgetting.unforgettable_categories;

    for (const entry of allSemantic) {
      // Skip migration-tagged entries
      if (entry.tags.includes("migration")) continue;
      // Skip unforgettable domains
      if (unforgettable.includes(entry.domain)) continue;

      const ageDays = (now - entry.created) / MS_PER_DAY;
      const effectiveImportance = Math.max(entry.importance, 0.1);
      const retention = Math.exp(-ageDays / (entry.half_life * effectiveImportance));

      this.db.updateSemanticRetention(entry.id, retention, entry.half_life);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4 — Self-Model Evolution
  // -----------------------------------------------------------------------

  private async evolveHypotheses(
    hypothesesUpdated: string[],
    capabilityChanges: string[],
  ): Promise<void> {
    const promotionThreshold = this.config.self_model.hypothesis.promotion_threshold;
    const demotionThreshold = this.config.self_model.hypothesis.demotion_threshold;
    const mode = this.gate.getMode();

    // Only evaluate hypotheses that existed BEFORE this cycle started.
    // Hypotheses in hypothesesUpdated were just created this cycle — skip them
    // so they can accumulate evidence before being judged.
    const newlyCreatedIds = new Set(hypothesesUpdated);
    const allHypotheses = this.db.getAllHypotheses();

    for (const hyp of allHypotheses) {
      if (newlyCreatedIds.has(hyp.id)) continue;

      if (hyp.evidence_for >= promotionThreshold) {
        const needsApproval = this.gate.requiresApproval("hypothesis_promotion");

        if (needsApproval || mode === "supervised" || mode === "gated") {
          // Write to pending file
          this.vault.append(
            "dreams/pending-evolution.md",
            `- [ ] Promote hypothesis: ${hyp.claim} (id: ${hyp.id})\n`,
          );
        } else {
          // Autonomous: apply directly
          this.db.updateHypothesisStatus(hyp.id, "confirmed");
          this.appendToIdentityMutable(hyp.claim);
          capabilityChanges.push(`Promoted: ${hyp.claim}`);
        }

        this.appendToEvolutionLog(`Hypothesis ${hyp.id} reached promotion threshold.`);
      }

      if ((hyp.evidence_for - hyp.evidence_against) <= demotionThreshold) {
        this.db.updateHypothesisStatus(hyp.id, "demoted");
        this.appendToEvolutionLog(`Hypothesis ${hyp.id} demoted.`);
        capabilityChanges.push(`Demoted: ${hyp.claim}`);
      }
    }
  }

  private appendToIdentityMutable(claim: string): void {
    const content = this.vault.read("self-model/identity.md") ?? "";
    const mutableStart = content.indexOf("<!-- MUTABLE -->");
    const mutableEnd = content.indexOf("<!-- /MUTABLE -->");
    if (mutableStart === -1 || mutableEnd === -1) return;

    const before = content.slice(0, mutableEnd);
    const after = content.slice(mutableEnd);
    this.vault.write("self-model/identity.md", before + `- ${claim}\n` + after);
  }

  private appendToEvolutionLog(message: string): void {
    const timestamp = new Date().toISOString();
    this.vault.append(
      "self-model/evolution-log.md",
      `- **${timestamp}**: ${message}\n`,
    );
  }

  // -----------------------------------------------------------------------
  // Phase 5 — Health Report
  // -----------------------------------------------------------------------

  private computeHealthScore(now: number): number {
    const allSemantic = this.db.getAllSemanticEntries();
    const allEpisodes = this.db.getPendingEpisodes(); // post-consolidation, this is empty
    // We need total episode count for efficiency — get all by checking consolidated too
    // Use a rough count based on semantic source_episode_ids
    const totalEpisodeCount = Math.max(allSemantic.length, 1); // fallback

    // Freshness: % of semantic entries accessed in last 30 days
    const thirtyDaysAgo = now - 30 * MS_PER_DAY;
    const freshCount = allSemantic.filter((s) => s.last_accessed >= thirtyDaysAgo).length;
    const freshness = allSemantic.length > 0 ? freshCount / allSemantic.length : 1.0;

    // Coverage: % of unique domains updated in last 14 days
    const fourteenDaysAgo = now - 14 * MS_PER_DAY;
    const allDomains = new Set(allSemantic.map((s) => s.domain));
    const recentDomains = new Set(
      allSemantic.filter((s) => s.last_accessed >= fourteenDaysAgo).map((s) => s.domain),
    );
    const coverage = allDomains.size > 0 ? recentDomains.size / allDomains.size : 1.0;

    // Coherence: avg relation count per semantic entry
    let totalRelations = 0;
    for (const s of allSemantic) {
      const rels = this.db.getRelationsTo(s.id);
      totalRelations += rels.length;
    }
    const coherence = allSemantic.length > 0
      ? Math.min(totalRelations / allSemantic.length / 3, 1.0) // normalize: 3 relations = 1.0
      : 0;

    // Efficiency: semantic count / (episode count + semantic count)
    const semanticCount = allSemantic.length;
    const efficiency = semanticCount > 0
      ? semanticCount / (totalEpisodeCount + semanticCount)
      : 0;

    // Groundedness: % of semantic entries with ref_count > 0
    const groundedCount = allSemantic.filter((s) => s.ref_count > 0).length;
    const groundedness = allSemantic.length > 0 ? groundedCount / allSemantic.length : 0;

    // Affective balance: mean valence of recent episodes (last 7 days)
    // Use getAllEpisodes() to include consolidated episodes as well.
    const sevenDaysAgo = now - 7 * MS_PER_DAY;
    const recentEpisodes = this.db.getAllEpisodes().filter(
      (e) => e.timestamp >= sevenDaysAgo,
    );
    const affectiveBalance = recentEpisodes.length > 0
      ? recentEpisodes.reduce((sum, e) => sum + e.valence, 0) / recentEpisodes.length * 0.5 + 0.5
      : 0.5;

    // Overall: weighted average (0-100)
    const overall =
      (freshness * 0.2 +
        coverage * 0.15 +
        coherence * 0.2 +
        efficiency * 0.15 +
        groundedness * 0.2 +
        affectiveBalance * 0.1) *
      100;

    return Math.round(Math.max(0, Math.min(100, overall)));
  }

  // -----------------------------------------------------------------------
  // Archiving
  // -----------------------------------------------------------------------

  private archiveLowRetention(): number {
    const allSemantic = this.db.getAllSemanticEntries();
    const minImportance = this.config.memory.forgetting.min_importance_to_keep;
    const unforgettableCategories = this.config.memory.forgetting.unforgettable_categories;
    const mergeBeforeDrop = this.config.memory.forgetting.merge_before_drop;
    let archived = 0;

    for (const entry of allSemantic) {
      // Tier 3: never archive migration-tagged or unforgettable-domain entries
      if (entry.tags.includes("migration")) continue;
      if (unforgettableCategories.includes(entry.domain)) continue;

      if (entry.retention >= minImportance) continue;

      // Tier 2: merge before drop
      if (mergeBeforeDrop) {
        const merged = this.tryMergeIntoDomainSurvivor(entry);
        if (merged) {
          archived++;
          continue;
        }
      }

      // Archive normally
      const content = this.vault.read(entry.file_path);
      if (!content) continue;  // skip entries with missing vault files
      this.vault.write(`archive/${entry.id}.md`, content);
      archived++;
    }

    return archived;
  }

  private tryMergeIntoDomainSurvivor(candidate: SemanticRecord): boolean {
    const sameDomain = this.db.getSemanticByDomain(candidate.domain);
    const survivors = sameDomain.filter(
      (s) => s.id !== candidate.id && s.retention >= 0.5
    );
    if (survivors.length === 0) return false;

    const candidateContent = this.vault.read(candidate.file_path);
    if (!candidateContent) return false;

    const words = candidateContent
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    if (words.length === 0) return false;

    // FTS4 MATCH with implicit AND — use OR to broaden the match
    const keywords = words.join(" OR ");
    if (!keywords) return false;

    let ftsResults: Array<{ source_id: string; source_type: string; rank: number }> = [];
    try {
      ftsResults = this.db.searchFTS(keywords, 10);
    } catch {
      return false;
    }

    const survivorIds = new Set(survivors.map((s) => s.id));
    const matchedSurvivor = ftsResults.find((r) => survivorIds.has(r.source_id));
    if (!matchedSurvivor) return false;

    const survivor = survivors.find((s) => s.id === matchedSurvivor.source_id)!;
    const survivorContent = this.vault.read(survivor.file_path) ?? "";

    const footnote = `\n\n<!-- merged from ${candidate.id} -->\n${candidateContent}\n`;
    this.vault.write(survivor.file_path, survivorContent + footnote);

    return true;
  }

  private decayStaleEdges(): void {
    const windowDays = this.config.memory.forgetting.decay_window_days;
    const staleEdges = this.db.getStaleEdges(windowDays);
    for (const edge of staleEdges) {
      const newWeight = Math.max(edge.weight * 0.9, 0.1);
      this.db.updateEdgeWeight(
        edge.source_id,
        edge.target_id,
        edge.relation_type,
        newWeight
      );
    }
  }

  // -----------------------------------------------------------------------
  // Report building & writing
  // -----------------------------------------------------------------------

  private buildReport(
    timestamp: number,
    episodesProcessed: number,
    consolidated: number,
    archived: number,
    hypothesesUpdated: string[],
    capabilityChanges: string[],
    securityFindings: string[],
  ): DreamReport {
    const healthScore = episodesProcessed === 0 ? 0 : this.computeHealthScore(timestamp);
    const digestPath = `dreams/dream-${formatTimestamp()}.md`;

    return {
      timestamp,
      episodesProcessed,
      consolidated,
      archived,
      hypothesesUpdated,
      capabilityChanges,
      healthScore,
      securityFindings,
      digestPath,
    };
  }

  private writeDreamDigest(report: DreamReport, now: number): void {
    const lines = [
      `# Dream Cycle Report`,
      "",
      `**Timestamp:** ${new Date(now).toISOString()}`,
      `**Episodes Processed:** ${report.episodesProcessed}`,
      `**Consolidated:** ${report.consolidated}`,
      `**Archived:** ${report.archived}`,
      `**Health Score:** ${report.healthScore}`,
      "",
      `## Health Metrics`,
      "",
      `- **Freshness**: % of semantic entries accessed in last 30 days`,
      `- **Coverage**: % of unique domains updated in last 14 days`,
      `- **Coherence**: avg relation count per semantic entry`,
      `- **Efficiency**: semantic / (episode + semantic)`,
      `- **Groundedness**: % of semantic entries with ref_count > 0`,
      `- **Affective balance**: mean valence of recent episodes`,
      "",
      `## Hypotheses Updated`,
      "",
      ...(report.hypothesesUpdated.length > 0
        ? report.hypothesesUpdated.map((h) => `- ${h}`)
        : ["(none)"]),
      "",
      `## Capability Changes`,
      "",
      ...(report.capabilityChanges.length > 0
        ? report.capabilityChanges.map((c) => `- ${c}`)
        : ["(none)"]),
      "",
    ];

    this.vault.write(report.digestPath, lines.join("\n"));
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private insertRelation(
    sourceId: string,
    targetId: string,
    relationType: "supports" | "contradicts" | "elaborates",
    confidence: number,
  ): void {
    const now = Date.now();
    const rel: RelationRecord = {
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType,
      weight: 1.0,
      created: now,
      last_used: now,
      provenance: "rule",
      confidence,
    };
    this.db.insertRelation(rel);
  }

  /**
   * FTS4 MATCH queries choke on special characters and certain tokens.
   * Strip anything that isn't alphanumeric or whitespace, then collapse spaces.
   */
  private sanitizeFtsQuery(query: string): string {
    return query
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
