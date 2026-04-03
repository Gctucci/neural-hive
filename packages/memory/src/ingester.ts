import * as path from "node:path";
import type { SemanticRecord, EpisodeRecord, MemoryType } from "@neuroclaw/config";
import type { NeuroclawDB } from "./sqlite";
import type { Vault } from "./vault";
import { computeImportance } from "./importance";

export interface IngestInput {
  filePath: string;
  content: string;
  type?: MemoryType;
  domain?: string;
  dryRun?: boolean;
  tags?: string;
}

export interface IngestedEntry {
  id: string;
  type: MemoryType;
  domain: string;
  vaultPath: string;
  sourceFile: string;
  content: string;
  importance: number;
}

export interface IngestResult {
  entries: IngestedEntry[];
  dryRun: boolean;
}

function generateId(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function deriveDomain(heading: string): string {
  return (
    heading
      .replace(/^#+\s*/, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "general"
  );
}

interface Section {
  heading: string;
  body: string;
  domain: string;
}

function splitByH2(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join("\n").trim();
    if (body.length > 0) {
      sections.push({
        heading: currentHeading,
        body,
        domain: deriveDomain(currentHeading),
      });
    }
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeading = line;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

function splitByParagraph(content: string): string[] {
  const paras = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const merged: string[] = [];
  for (const para of paras) {
    if (merged.length > 0 && merged[merged.length - 1].length < 50) {
      merged[merged.length - 1] = merged[merged.length - 1] + "\n\n" + para;
    } else {
      merged.push(para);
    }
  }
  return merged;
}

function hasH2(content: string): boolean {
  return content.split("\n").some((l) => l.startsWith("## "));
}

function extractDateFromPath(filePath: string): string {
  const basename = path.basename(filePath, ".md");
  if (/^\d{4}-\d{2}-\d{2}$/.test(basename)) return basename;
  return new Date().toISOString().slice(0, 10);
}

function buildFrontmatter(
  id: string,
  sourceFile: string,
  domain: string,
  tags: string
): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    "---",
    `id: ${id}`,
    `source: ${sourceFile}`,
    `domain: ${domain}`,
    `tags: ${tags}`,
    `imported: ${date}`,
    "---",
    "",
  ].join("\n");
}

export class Ingester {
  private db: NeuroclawDB;
  private vault: Vault;

  constructor(db: NeuroclawDB, vault: Vault) {
    this.db = db;
    this.vault = vault;
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const {
      filePath,
      content,
      type,
      domain: domainOverride,
      dryRun = false,
      tags = "",
    } = input;

    const sourceFile = path.basename(filePath);
    const isMigration = tags.includes("migration");
    const baseWeight = isMigration ? 0.6 : 0.5;
    const resolvedType: MemoryType = type ?? "semantic";

    let sections: Array<{ domain: string; body: string; heading?: string }>;

    if (resolvedType === "episodic") {
      sections = [{ domain: domainOverride ?? "daily-memory", body: content.trim() }];
    } else if (domainOverride) {
      if (hasH2(content)) {
        sections = splitByH2(content).map((s) => ({ ...s, domain: domainOverride }));
      } else {
        sections = splitByParagraph(content).map((body) => ({ domain: domainOverride, body }));
      }
    } else if (hasH2(content)) {
      sections = splitByH2(content);
    } else {
      sections = splitByParagraph(content).map((body) => ({ domain: "general", body }));
    }

    const entries: IngestedEntry[] = [];

    for (const section of sections) {
      if (!section.body) continue;

      const importance = computeImportance({
        baseWeight,
        recencyFactor: 1.0,
        refCount: 0,
        outcomeSignal: 0,
        isCorrection: false,
        valenceMagnitude: 0,
      });

      if (resolvedType === "episodic") {
        const id = generateId("ep");
        const date = extractDateFromPath(filePath);
        const vaultPath = `episodic/${date}/${id}.md`;
        const frontmatter = buildFrontmatter(id, sourceFile, section.domain, tags);
        const fileContent = frontmatter + section.body + "\n";

        entries.push({
          id,
          type: "episodic",
          domain: section.domain,
          vaultPath,
          sourceFile,
          content: section.body,
          importance,
        });

        if (!dryRun) {
          this.vault.write(vaultPath, fileContent);
          const now = Date.now();
          const record: EpisodeRecord = {
            id,
            timestamp: now,
            session_id: "migration",
            project: null,
            importance,
            is_correction: false,
            outcome_signal: 0,
            consolidation_status: "migrated",
            file_path: vaultPath,
            summary: section.body.slice(0, 200),
            valence: 0,
            arousal: 0,
            context_snippet: "",
          };
          this.db.insertEpisode(record);
          this.db.indexContent(id, "episodic", section.body);
        }
      } else {
        const id = generateId("sem");
        const vaultPath = `semantic/domains/${section.domain}/${id}.md`;
        const frontmatter = buildFrontmatter(id, sourceFile, section.domain, tags);
        const fileContent = frontmatter + section.body + "\n";

        entries.push({
          id,
          type: "semantic",
          domain: section.domain,
          vaultPath,
          sourceFile,
          content: section.body,
          importance,
        });

        if (!dryRun) {
          this.vault.write(vaultPath, fileContent);
          const now = Date.now();
          const record: SemanticRecord = {
            id,
            domain: section.domain,
            created: now,
            last_accessed: now,
            importance,
            ref_count: 0,
            confidence: 0.8,
            file_path: vaultPath,
            line_range: null,
            half_life: 30,
            retention: 1.0,
            source_episode_ids: "",
            tags,
          };
          this.db.insertSemantic(record);
          const indexedContent = section.heading
            ? `${section.heading}\n${section.body}`
            : section.body;
          this.db.indexContent(id, "semantic", indexedContent);
        }
      }
    }

    return { entries, dryRun };
  }
}
