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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-retrieval-"));
    vault = new Vault(tmpDir);
    vault.init();
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
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
      tags: "",
    });
    db.indexContent(id, "semantic", "Authentication JWT tokens and OAuth2 flows.");

    const results = engine.search("authentication");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe("semantic/domains/auth.md");
    expect(results[0].content).toContain("Authentication");
  });

  it("discovers related entries via graph walk", () => {
    const now = Date.now();

    // Insert two semantic entries
    db.insertSemantic({
      id: "sem-gw1",
      file_path: "semantic/domains/auth-gw.md",
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
      tags: "",
    });
    db.insertSemantic({
      id: "sem-gw2",
      file_path: "semantic/domains/security-gw.md",
      importance: 0.7,
      domain: "security",
      created: now,
      last_accessed: now,
      ref_count: 0,
      confidence: 0.9,
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "",
    });

    // Index them in FTS
    db.indexContent("sem-gw1", "semantic", "authentication session tokens OAuth2 login");
    db.indexContent("sem-gw2", "semantic", "security CORS headers content policy");

    // Write vault files
    vault.write("semantic/domains/auth-gw.md", "# Auth\nSession tokens and OAuth2.");
    vault.write("semantic/domains/security-gw.md", "# Security\nCORS and content security policy.");

    // Insert a "requires" relation between them
    db.insertRelation({
      source_id: "sem-gw1",
      target_id: "sem-gw2",
      relation_type: "requires",
      weight: 0.9,
      created: now,
      last_used: now,
      provenance: "rule",
      confidence: 0.9,
    });

    // Query triggers graph walk because of "relate"
    const results = engine.search("how does authentication relate to security headers");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GSEM edge weight refinement", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let retrieval: RetrievalEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-gsem-"));
    vault = new Vault(tmpDir);
    vault.init();
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
    retrieval = new RetrievalEngine(db, vault);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("increments edge weight after graph-walk traversal", () => {
    db.insertSemantic({
      id: "sem-gsem-a",
      domain: "auth",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.8,
      ref_count: 0,
      confidence: 0.9,
      file_path: "semantic/domains/auth/sem-gsem-a.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "",
    });
    db.insertSemantic({
      id: "sem-gsem-b",
      domain: "security",
      created: Date.now(),
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 0,
      confidence: 0.8,
      file_path: "semantic/domains/security/sem-gsem-b.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "",
    });
    db.insertRelation({
      source_id: "sem-gsem-a",
      target_id: "sem-gsem-b",
      relation_type: "supports",
      weight: 1.0,
      created: Date.now(),
      last_used: Date.now(),
      provenance: "rule",
      confidence: 1.0,
    });

    vault.write(
      "semantic/domains/auth/sem-gsem-a.md",
      "Auth middleware session validation"
    );
    vault.write(
      "semantic/domains/security/sem-gsem-b.md",
      "Security token validation"
    );
    db.indexContent("sem-gsem-a", "semantic", "Auth middleware session validation");

    retrieval.search("how does auth relate to security");

    const rels = db.getRelationsFrom("sem-gsem-a");
    expect(rels[0].weight).toBeGreaterThan(1.0);
  });
});

describe("source citations", () => {
  let tmpDir: string;
  let db: NeuroclawDB;
  let vault: Vault;
  let retrieval: RetrievalEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-cite-"));
    vault = new Vault(tmpDir);
    vault.init();
    db = NeuroclawDB.create(path.join(tmpDir, "index.db"));
    retrieval = new RetrievalEngine(db, vault);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("populates citationLabel on FTS results for migration-tagged entries", () => {
    db.insertSemantic({
      id: "sem-cite-1",
      domain: "coding-preferences",
      created: Date.now() - 3 * 86_400_000,  // 3 days ago
      last_accessed: Date.now(),
      importance: 0.7,
      ref_count: 0,
      confidence: 0.8,
      file_path: "semantic/domains/coding-preferences/sem-cite-1.md",
      line_range: null,
      half_life: 30,
      retention: 1.0,
      source_episode_ids: "",
      tags: "migration,source:MEMORY.md",
    });
    vault.write(
      "semantic/domains/coding-preferences/sem-cite-1.md",
      "I prefer TypeScript strict mode"
    );
    db.indexContent("sem-cite-1", "semantic", "I prefer TypeScript strict mode");

    const results = retrieval.search("TypeScript strict");
    expect(results).toHaveLength(1);
    expect(results[0].sourceFile).toBe("MEMORY.md");
    expect(results[0].domain).toBe("coding-preferences");
    expect(results[0].createdAt).toBeDefined();
    expect(results[0].citationLabel).toMatch(/MEMORY\.md/);
    expect(results[0].citationLabel).toMatch(/\d+d ago|today/);
  });
});
