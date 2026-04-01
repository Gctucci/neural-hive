import type { Vault } from "./vault";

const WORKING_MEMORY_FILE = "working.md";
const HEADER = "# Working Memory\n\n";

interface Entry {
  key?: string;
  text: string;
}

export class WorkingMemory {
  private vault: Vault;
  private maxLines: number;

  constructor(vault: Vault, maxLines: number = 100) {
    this.vault = vault;
    this.maxLines = maxLines;
  }

  load(): string {
    return this.vault.read(WORKING_MEMORY_FILE) ?? HEADER;
  }

  addEntry(text: string, key?: string): void {
    const lines = this.parseEntries();

    if (key) {
      const idx = lines.findIndex((l) => l.key === key);
      if (idx !== -1) {
        lines[idx] = { key, text };
      } else {
        lines.push({ key, text });
      }
    } else {
      lines.push({ text });
    }

    this.writeEntries(lines);
  }

  private parseEntries(): Entry[] {
    const content = this.load();
    const lines = content.split("\n");
    const entries: Entry[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed === "(Empty — will be populated from interactions.)") {
        continue;
      }

      // Match: - [key] text or - text
      const keyMatch = trimmed.match(/^-\s+\[([^\]]+)\]\s+(.+)$/);
      if (keyMatch) {
        entries.push({ key: keyMatch[1], text: keyMatch[2] });
      } else {
        const textMatch = trimmed.match(/^-\s+(.+)$/);
        if (textMatch) {
          entries.push({ text: textMatch[1] });
        }
      }
    }

    return entries;
  }

  private writeEntries(entries: Entry[]): void {
    while (entries.length > this.maxLines) {
      entries.shift();
    }

    const lines = entries.map((e) => {
      if (e.key) {
        return `- [${e.key}] ${e.text}`;
      }
      return `- ${e.text}`;
    });

    const content = HEADER + (lines.length > 0 ? lines.join("\n") + "\n" : "");
    this.vault.write(WORKING_MEMORY_FILE, content);
  }
}
