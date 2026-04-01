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

  return program;
}
