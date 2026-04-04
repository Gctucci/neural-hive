import * as path from "node:path";
import * as os from "node:os";
import { Command } from "commander";
import { NeuroclawEngine } from "./engine";

function getDefaultConfigDir(): string {
  return path.join(os.homedir(), "neuroclaw", "config");
}

export function createCLI(): Command {
  const program = new Command();

  program
    .name("neuroclaw")
    .description("NeuroClaw — Self-improving agent memory engine")
    .version("0.1.0");

  // neuroclaw init
  program
    .command("init")
    .description("Initialize NeuroClaw (first-run wizard)")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .action((opts) => {
      console.log("NeuroClaw initialization wizard");
      console.log(`Config dir: ${opts.configDir}`);
      console.log("(Full wizard will be implemented in Phase 2)");
    });

  // neuroclaw config show
  const configCmd = program.command("config").description("Manage configuration");
  configCmd
    .command("show")
    .description("Show current config")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .action((opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        const config = engine.getConfig();
        console.log(JSON.stringify(config, null, 2));
        engine.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
      }
    });

  // neuroclaw search
  program
    .command("search <query>")
    .description("Search memory")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .option("--limit <n>", "Max results", "10")
    .action(async (query, opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        await engine.init();
        const results = engine.search(query, parseInt(opts.limit, 10));
        if (results.length === 0) {
          console.log("No results found.");
        } else {
          for (const r of results) {
            console.log(`[${r.relevanceScore.toFixed(3)}] ${r.source}`);
            console.log(r.content.slice(0, 200));
            console.log("---");
          }
        }
        engine.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
      }
    });

  // neuroclaw status
  program
    .command("status")
    .description("Show health metrics")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .action(async (opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        await engine.init();
        const config = engine.getConfig();
        console.log(`Agent: ${config.agent.id}`);
        console.log(`Governance: ${engine.getGovernanceMode()}`);
        console.log("(Full health metrics will be implemented with dream cycle)");
        engine.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
      }
    });

  // neuroclaw migrate
  program
    .command("migrate")
    .description("Import OpenClaw MEMORY.md and memory/ files into NeuroClaw vault")
    .requiredOption("--from <dir>", "OpenClaw project directory to migrate from")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .option("--dry-run", "Preview without writing", false)
    .option("--scan", "Only scan and report files found, no import", false)
    .action(async (opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        await engine.init();

        if (opts.scan) {
          const fs2 = await import("node:fs");
          const path2 = await import("node:path");
          const memoryPath = path2.join(opts.from, "MEMORY.md");
          const memoryDir = path2.join(opts.from, "memory");
          console.log(`Scanning ${opts.from}:`);
          if (fs2.existsSync(memoryPath)) {
            console.log(`  MEMORY.md              → found`);
          } else {
            console.log(`  MEMORY.md              → not found`);
          }
          if (fs2.existsSync(memoryDir)) {
            const dailyFiles = fs2
              .readdirSync(memoryDir)
              .filter((f: string) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
            console.log(`  memory/ daily files    → ${dailyFiles.length} found`);
          } else {
            console.log(`  memory/                → not found`);
          }
          engine.close();
          return;
        }

        const report = await engine.migrateFromOpenClaw(opts.from, {
          dryRun: opts.dryRun,
        });

        if (opts.dryRun) {
          console.log(`Dry run — would import ${report.imported} entries from ${opts.from}`);
          for (const entry of report.entries) {
            console.log(`  [${entry.type}] ${entry.domain} — ${entry.sourceFile}`);
          }
        } else {
          console.log(`Migrated ${report.imported} entries from ${opts.from}`);
          const semantic = report.entries.filter((e) => e.type === "semantic").length;
          const episodic = report.entries.filter((e) => e.type === "episodic").length;
          if (semantic > 0) console.log(`  ${semantic} semantic  (MEMORY.md)`);
          if (episodic > 0) console.log(`  ${episodic} episodic  (memory/)`);
        }
        engine.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
      }
    });

  // neuroclaw ingest
  program
    .command("ingest <path>")
    .description("Ingest a markdown file into NeuroClaw vault")
    .option("--config-dir <path>", "Config directory", getDefaultConfigDir())
    .option("--agent <id>", "Agent ID")
    .option("--type <type>", "Memory type: semantic, procedural, episodic")
    .option("--domain <domain>", "Domain tag")
    .option("--dry-run", "Preview without writing", false)
    .option("--recursive", "Ingest all .md files in directory recursively", false)
    .action(async (filePath, opts) => {
      try {
        const engine = new NeuroclawEngine(opts.configDir, opts.agent);
        await engine.init();

        const fs2 = await import("node:fs");
        const path2 = await import("node:path");

        const targets: string[] = [];
        if (opts.recursive && fs2.statSync(filePath).isDirectory()) {
          const walk = (dir: string) => {
            for (const f of fs2.readdirSync(dir)) {
              const full = path2.join(dir, f);
              if (fs2.statSync(full).isDirectory()) walk(full);
              else if (f.endsWith(".md")) targets.push(full);
            }
          };
          walk(filePath);
        } else {
          targets.push(filePath);
        }

        let totalImported = 0;
        for (const target of targets) {
          const result = await engine.ingestFile(target, {
            type: opts.type as "semantic" | "procedural" | "episodic" | undefined,
            domain: opts.domain,
            dryRun: opts.dryRun,
          });
          totalImported += result.entries.length;
          if (opts.dryRun) {
            for (const e of result.entries) {
              console.log(`  [dry-run] ${e.type}/${e.domain} — ${path2.basename(target)}`);
            }
          }
        }

        if (opts.dryRun) {
          console.log(`Would import ${totalImported} entries.`);
        } else {
          console.log(`Ingested ${totalImported} entries.`);
        }
        engine.close();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
        process.exit(1);
      }
    });

  return program;
}
