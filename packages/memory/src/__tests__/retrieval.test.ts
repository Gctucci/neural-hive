import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { NeuroclawDB } from "../sqlite";
import { Vault } from "../vault";
import { RetrievalEngine, classifyQuery } from "../retrieval";

describe("classifyQuery", () => {
  it("classifies short simple queries as text_search", () => {
    expect(classifyQuery("authentication")).toBe("text_search");
    expect(classifyQuery("TypeScript patterns")).toBe("text_search");
  });

  it("classifies relational queries as graph_walk", () => {
    expect(
      classifyQuery("how does authentication relate to the API layer")
    ).toBe("graph_walk");
    expect(
      classifyQuery("what connects the payment system to user profiles")
    ).toBe("graph_walk");
  });

  it("classifies multi-domain queries as graph_walk", () => {
    expect(
      classifyQuery("compare the testing approach in frontend and backend security modules")
    ).toBe("graph_walk");
  });
});

describe("RetrievalEngine", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let engine: RetrievalEngine;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-retrieval-"));
    vault = new Vault(tmpDir);
    vault.init();
    db = await NeuroclawDB.create(path.join(tmpDir, "index.db"));
    engine = new RetrievalEngine(db, vault);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no content indexed", () => {
    const results = engine.search("anything");
    expect(results).toEqual([]);
  });

  it("returns results after indexing content", () => {
    // Write a vault file
    vault.write("semantic/domains/auth.md", "# Authentication\nJWT tokens and OAuth2 flows.");

    // Index it in SQLite with full SemanticRecord shape
    const id = "auth-001";
    const now = Date.now();
    db.insertSemantic({
      id,
      file_path: "semantic/domains/auth.md",
      importance: 0.8,
      domain: "auth",
      created: now,
      last_accessed: now,
      ref_count: 0,
      confidence: 0.9,
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
    });
    db.indexContent(id, "semantic", "Authentication JWT tokens and OAuth2 flows.");

    const results = engine.search("authentication");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe("semantic/domains/auth.md");
    expect(results[0].content).toContain("Authentication");
  });
});
