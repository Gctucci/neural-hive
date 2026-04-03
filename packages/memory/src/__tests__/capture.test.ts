import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { LocalValenceScorer } from "../valence";
import { EpisodeCapture } from "../capture";

describe("EpisodeCapture", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let capture: EpisodeCapture;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-capture-"));
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
    vault = new Vault(tmpDir);
    vault.init();
    const scorer = new LocalValenceScorer();
    capture = new EpisodeCapture(db, vault, scorer);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("captures an episode and returns a complete record", async () => {
    const record = await capture.capture({
      sessionId: "session-001",
      project: "neuroclaw",
      interactionText: "Great job! The implementation looks perfect and works well.",
      summary: "User praised the implementation as perfect.",
      isCorrection: false,
      outcomeSignal: 0.8,
    });

    // Check ID pattern
    expect(record.id).toMatch(/^ep-\d+-[a-z0-9]{6}$/);
    // Check session_id and project
    expect(record.session_id).toBe("session-001");
    expect(record.project).toBe("neuroclaw");
    // Check consolidation status
    expect(record.consolidation_status).toBe("pending");
    // Positive text should produce positive valence
    expect(record.valence).toBeGreaterThan(0);
    // Importance should be in 0-1 range
    expect(record.importance).toBeGreaterThan(0);
    expect(record.importance).toBeLessThanOrEqual(1);
  });

  it("writes episode markdown file to vault", async () => {
    const record = await capture.capture({
      sessionId: "session-002",
      project: "test-project",
      interactionText: "Thanks for the help with the config setup.",
      summary: "Configured the project successfully.",
      isCorrection: false,
      outcomeSignal: 0.5,
    });

    // Check file exists
    expect(vault.exists(record.file_path)).toBe(true);

    const content = vault.read(record.file_path);
    expect(content).not.toBeNull();
    // Contains summary
    expect(content).toContain("Configured the project successfully.");
    // Contains valence in frontmatter
    expect(content).toContain("valence:");
  });

  it("inserts the record into the database", async () => {
    await capture.capture({
      sessionId: "session-003",
      project: "my-project",
      interactionText: "The test passed after the fix.",
      summary: "Fixed the failing test.",
      isCorrection: false,
      outcomeSignal: 0.6,
    });

    const pending = db.getPendingEpisodes();
    expect(pending).toHaveLength(1);
    expect(pending[0].session_id).toBe("session-003");
    expect(pending[0].consolidation_status).toBe("pending");
  });

  it("indexes content for FTS search", async () => {
    await capture.capture({
      sessionId: "session-004",
      project: "search-project",
      interactionText: "We implemented the episodic memory capture pipeline.",
      summary: "Episodic capture pipeline is now working.",
      isCorrection: false,
      outcomeSignal: 0.7,
    });

    const results = db.searchFTS("episodic capture");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source_type).toBe("episodic");
  });

  it("correction episodes get higher importance than normal ones", async () => {
    const normalRecord = await capture.capture({
      sessionId: "session-005",
      project: "test",
      interactionText: "The code looks fine.",
      summary: "Normal interaction.",
      isCorrection: false,
      outcomeSignal: 0.0,
    });

    const correctionRecord = await capture.capture({
      sessionId: "session-005",
      project: "test",
      interactionText: "No, that's wrong. Try again.",
      summary: "User corrected the approach.",
      isCorrection: true,
      outcomeSignal: 0.0,
    });

    expect(correctionRecord.importance).toBeGreaterThan(normalRecord.importance);
  });
});
