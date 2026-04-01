import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AuditTrail } from "../audit";

describe("AuditTrail", () => {
  let tmpDir: string;
  let auditPath: string;
  let trail: AuditTrail;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neuroclaw-audit-"));
    auditPath = path.join(tmpDir, "audit-trail.md");
    trail = new AuditTrail(auditPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("creates the audit file on first log", () => {
    trail.log({
      operation: "semantic_consolidation",
      component: "semantic/domains/typescript.md",
      description: "Created new semantic entry",
      evidence: ["session-2026-04-01-abc"],
    });
    expect(fs.existsSync(auditPath)).toBe(true);
  });

  it("appends entries with timestamps", () => {
    trail.log({
      operation: "self_model_mutation",
      component: "capabilities.md",
      description: "Added TypeScript as strength",
      evidence: ["session-abc", "session-def"],
    });
    trail.log({
      operation: "hypothesis_promotion",
      component: "hypotheses.md",
      description: "Promoted hyp-001 to confirmed",
      evidence: ["session-ghi"],
    });

    const content = fs.readFileSync(auditPath, "utf-8");
    const entries = content.split("\n---\n").filter((e) => e.trim());
    expect(entries.length).toBe(2);
  });

  it("never contains sensitive data in the log", () => {
    trail.log({
      operation: "episodic_capture",
      component: "episodic/2026-04-01/session-abc.md",
      description: "Blocked write: credential detected",
      evidence: [],
    });

    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).not.toContain("password");
    expect(content).not.toContain("sk-");
  });
});
