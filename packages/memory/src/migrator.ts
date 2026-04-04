import * as fs from "node:fs";
import * as path from "node:path";
import type { Ingester, IngestedEntry, IngestResult } from "./ingester";

export interface MigrationManifestFile {
  path: string;
  fileType: "memory" | "daily";
  exists: boolean;
}

export interface MigrationManifest {
  workDir: string;
  files: MigrationManifestFile[];
}

export interface MigrationReport {
  workDir: string;
  scanned: number;
  imported: number;
  skipped: number;
  entries: IngestedEntry[];
  dryRun: boolean;
}

const DAILY_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

export class Migrator {
  private ingester: Ingester;

  constructor(ingester: Ingester) {
    this.ingester = ingester;
  }

  scan(workDir: string): MigrationManifest {
    const files: MigrationManifestFile[] = [];

    const memoryPath = path.join(workDir, "MEMORY.md");
    files.push({
      path: memoryPath,
      fileType: "memory",
      exists: fs.existsSync(memoryPath),
    });

    const memoryDir = path.join(workDir, "memory");
    if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
      const dailyFiles = fs
        .readdirSync(memoryDir)
        .filter((f) => DAILY_PATTERN.test(f))
        .sort();

      for (const file of dailyFiles) {
        files.push({
          path: path.join(memoryDir, file),
          fileType: "daily",
          exists: true,
        });
      }
    }

    return { workDir, files };
  }

  async run(
    manifest: MigrationManifest,
    options?: { dryRun?: boolean }
  ): Promise<MigrationReport> {
    const dryRun = options?.dryRun ?? false;
    const allEntries: IngestedEntry[] = [];
    let skipped = 0;

    for (const file of manifest.files) {
      if (!file.exists) {
        skipped++;
        continue;
      }

      const content = fs.readFileSync(file.path, "utf-8");
      const sourceFile = path.basename(file.path);

      let result: IngestResult;

      if (file.fileType === "memory") {
        result = await this.ingester.ingest({
          filePath: file.path,
          content,
          type: "semantic",
          tags: `migration,source:MEMORY.md`,
          dryRun,
        });
      } else {
        result = await this.ingester.ingest({
          filePath: file.path,
          content,
          type: "episodic",
          tags: `migration,source:${sourceFile}`,
          dryRun,
        });
      }

      allEntries.push(...result.entries);
    }

    return {
      workDir: manifest.workDir,
      scanned: manifest.files.length,
      imported: allEntries.length,
      skipped,
      entries: allEntries,
      dryRun,
    };
  }
}
