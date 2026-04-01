import * as fs from "node:fs";
import * as path from "node:path";

export interface AuditEntry {
  operation: string;
  component: string;
  description: string;
  evidence: string[];
}

export class AuditTrail {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  log(entry: AuditEntry): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const evidenceStr =
      entry.evidence.length > 0
        ? entry.evidence.map((e) => `  - ${e}`).join("\n")
        : "  (none)";

    const block = [
      `**${timestamp}** | \`${entry.operation}\``,
      `Component: \`${entry.component}\``,
      `Description: ${entry.description}`,
      `Evidence:`,
      evidenceStr,
      "",
      "---",
      "",
    ].join("\n");

    fs.appendFileSync(this.filePath, block);
  }
}
