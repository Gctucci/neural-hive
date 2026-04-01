import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_IDENTITY = `<!-- CORE -->
I am a coding agent focused on helping my user write correct, maintainable software.
I am honest about what I don't know.
<!-- /CORE -->

<!-- MUTABLE -->
(No learned traits yet — these emerge from experience.)
<!-- /MUTABLE -->
`;

const DEFAULT_CAPABILITIES = `# Capabilities

## Strengths
(None confirmed yet — these are built from evidence.)

## Weaknesses
(None detected yet.)

## Unknown
(Everything — this fills in as I encounter tasks.)
`;

const DEFAULT_HYPOTHESES = `# Hypotheses

(No behavioral hypotheses yet — these form from observations.)
`;

const VAULT_DIRS = [
  "episodic",
  "semantic/domains",
  "semantic/projects",
  "procedural",
  "self-model",
  "dreams",
  "archive",
];

export class Vault {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  private resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  init(): void {
    for (const dir of VAULT_DIRS) {
      fs.mkdirSync(this.resolve(dir), { recursive: true });
    }

    if (!this.exists("working.md")) {
      this.write("working.md", "# Working Memory\n\n(Empty — will be populated from interactions.)\n");
    }
    if (!this.exists("self-model/identity.md")) {
      this.write("self-model/identity.md", DEFAULT_IDENTITY);
    }
    if (!this.exists("self-model/capabilities.md")) {
      this.write("self-model/capabilities.md", DEFAULT_CAPABILITIES);
    }
    if (!this.exists("self-model/hypotheses.md")) {
      this.write("self-model/hypotheses.md", DEFAULT_HYPOTHESES);
    }
    if (!this.exists("self-model/evolution-log.md")) {
      this.write("self-model/evolution-log.md", "# Evolution Log\n\n");
    }
  }

  read(relativePath: string): string | null {
    const fullPath = this.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, "utf-8");
  }

  write(relativePath: string, content: string): void {
    const fullPath = this.resolve(relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  append(relativePath: string, content: string): void {
    const fullPath = this.resolve(relativePath);
    fs.appendFileSync(fullPath, content);
  }

  exists(relativePath: string): boolean {
    return fs.existsSync(this.resolve(relativePath));
  }

  list(relativePath: string): string[] {
    const fullPath = this.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return [];
    return fs.readdirSync(fullPath).filter((f) => {
      return fs.statSync(path.join(fullPath, f)).isFile();
    });
  }

  move(from: string, to: string): void {
    const content = this.read(from);
    if (content === null) {
      throw new Error(`File not found: ${from}`);
    }
    this.write(to, content);
    fs.unlinkSync(this.resolve(from));
  }

  getRoot(): string {
    return this.root;
  }
}
