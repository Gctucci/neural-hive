import * as path from "node:path";
import { loadConfig, resolveStorePath } from "@neuroclaw/config";
import type { NeuroclawConfig } from "@neuroclaw/config";
import { Vault, NeuroclawDB, WorkingMemory, RetrievalEngine } from "@neuroclaw/memory";
import type { RetrievedMemory } from "@neuroclaw/memory";
import { GovernanceGate, AuditTrail, SecurityScanner } from "@neuroclaw/governance";
import type { GovernanceMode } from "./types";

export class NeuroclawEngine {
  private config: NeuroclawConfig;
  private vault!: Vault;
  private db!: NeuroclawDB;
  private workingMemory!: WorkingMemory;
  private retrieval!: RetrievalEngine;
  private gate!: GovernanceGate;
  private audit!: AuditTrail;
  private scanner!: SecurityScanner;
  private storePath!: string;

  constructor(configDir: string, agentId?: string) {
    this.config = loadConfig(configDir, agentId);
  }

  async init(): Promise<void> {
    this.storePath = resolveStorePath(
      this.config.agent.store_path,
      this.config.agent.id
    );

    this.vault = new Vault(this.storePath);
    this.vault.init();

    const dbPath = path.join(this.storePath, "index.db");
    this.db = await NeuroclawDB.create(dbPath);
    this.db.save();

    this.workingMemory = new WorkingMemory(
      this.vault,
      this.config.memory.working_memory_max_lines
    );

    this.retrieval = new RetrievalEngine(this.db, this.vault);

    this.gate = new GovernanceGate(
      this.config.governance.mode as GovernanceMode
    );

    this.audit = new AuditTrail(
      path.join(this.storePath, "audit.md")
    );

    this.scanner = new SecurityScanner(this.config.security);
  }

  search(query: string, limit = 10): RetrievedMemory[] {
    return this.retrieval.search(query, limit);
  }

  getConfig(): NeuroclawConfig {
    return this.config;
  }

  getWorkingMemory(): string {
    return this.workingMemory.load();
  }

  getGovernanceMode(): GovernanceMode {
    return this.config.governance.mode as GovernanceMode;
  }

  getGovernanceGate(): GovernanceGate {
    return this.gate;
  }

  getAuditTrail(): AuditTrail {
    return this.audit;
  }

  getSecurityScanner(): SecurityScanner {
    return this.scanner;
  }

  close(): void {
    this.db?.close();
  }
}
