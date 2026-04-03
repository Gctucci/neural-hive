import type { EpisodeRecord } from "@neuroclaw/config";
import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";
import type { ValenceScorer } from "./valence";
import { computeImportance } from "./importance";

export interface CaptureInput {
  sessionId: string;
  project: string | null;
  interactionText: string;
  summary: string;
  isCorrection: boolean;
  outcomeSignal: number;
}

export class EpisodeCapture {
  constructor(
    private readonly db: NeuroclawDB,
    private readonly vault: Vault,
    private readonly scorer: ValenceScorer
  ) {}

  async capture(input: CaptureInput): Promise<EpisodeRecord> {
    const { sessionId, project, interactionText, summary, isCorrection, outcomeSignal } = input;

    // 1. Generate a unique ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const id = `ep-${timestamp}-${random}`;

    // 2. Score valence/arousal
    const valenceResult = await this.scorer.score(interactionText);

    // 3. Compute importance
    const importance = computeImportance({
      baseWeight: 0.5,
      recencyFactor: 1.0,
      refCount: 0,
      outcomeSignal,
      isCorrection,
      valenceMagnitude: Math.abs(valenceResult.valence),
    });

    // 4. Build the EpisodeRecord
    const filePath = `episodic/${id}.md`;
    const record: EpisodeRecord = {
      id,
      timestamp,
      session_id: sessionId,
      project,
      importance,
      is_correction: isCorrection,
      outcome_signal: outcomeSignal,
      consolidation_status: "pending",
      file_path: filePath,
      summary,
      valence: valenceResult.valence,
      arousal: valenceResult.arousal,
      context_snippet: interactionText.slice(0, 200),
    };

    // 5. Write markdown file to vault
    const frontmatter = [
      "---",
      `id: ${id}`,
      `session: ${sessionId}`,
      `valence: ${valenceResult.valence}`,
      `arousal: ${valenceResult.arousal}`,
      `importance: ${importance}`,
      `is_correction: ${isCorrection}`,
      "---",
      "",
    ].join("\n");
    this.vault.write(filePath, frontmatter + summary + "\n");

    // 6. Insert the record into DB
    this.db.insertEpisode(record);

    // 7. Index content into FTS
    this.db.indexContent(id, "episodic", summary + " " + interactionText);

    return record;
  }
}
