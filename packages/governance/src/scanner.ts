export interface SecurityConfig {
  sensitive_data: "block" | "redact";
  pii_handling: "block" | "redact";
  custom_patterns: CustomPattern[];
  vault_audit: boolean;
}

export interface CustomPattern {
  name: string;
  pattern: string;
  action: "block" | "redact";
}

export interface ScanFinding {
  type: "api_key" | "credential" | "private_key" | "env_variable" | "pii" | "custom";
  pattern: string;
  match: string;
  action: "block" | "redact";
}

export interface ScanResult {
  blocked: boolean;
  findings: ScanFinding[];
  redacted: string;
}

// Always-blocked patterns (hardcoded, no config override)
const ALWAYS_BLOCK_PATTERNS: Array<{
  type: ScanFinding["type"];
  pattern: RegExp;
  name: string;
}> = [
  // API keys
  { type: "api_key", pattern: /sk-[a-zA-Z0-9_-]{20,}/, name: "OpenAI key" },
  { type: "api_key", pattern: /AKIA[0-9A-Z]{16}/, name: "AWS access key" },
  { type: "api_key", pattern: /ghp_[a-zA-Z0-9]{36,}/, name: "GitHub PAT" },
  { type: "api_key", pattern: /xox[bpors]-[a-zA-Z0-9-]+/, name: "Slack token" },
  {
    type: "api_key",
    pattern: /Bearer\s+eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    name: "Bearer JWT",
  },
  // Credentials
  {
    type: "credential",
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*\S+/i,
    name: "password assignment",
  },
  {
    type: "credential",
    pattern: /(?:secret|client_secret|api_secret)\s*[=:]\s*\S+/i,
    name: "secret assignment",
  },
  {
    type: "credential",
    pattern: /[a-zA-Z]+:\/\/[^:]+:[^@]+@[^/]+/,
    name: "connection string with credentials",
  },
  // Private keys
  {
    type: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
    name: "PEM private key",
  },
  // Environment variables with secrets
  {
    type: "env_variable",
    pattern: /export\s+(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIALS?)[_A-Z]*\s*=/i,
    name: "exported secret env var",
  },
];

// PII patterns (configurable action)
const PII_PATTERNS: Array<{
  subtype: string;
  pattern: RegExp;
}> = [
  { subtype: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { subtype: "phone", pattern: /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/ },
];

export class SecurityScanner {
  private config: SecurityConfig;
  private customRegexes: Array<{ name: string; regex: RegExp; action: "block" | "redact" }>;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.customRegexes = config.custom_patterns.map((p) => ({
      name: p.name,
      regex: new RegExp(p.pattern),
      action: p.action,
    }));
  }

  scan(content: string): ScanResult {
    const findings: ScanFinding[] = [];
    let redacted = content;
    let blocked = false;

    // Always-blocked patterns
    for (const { type, pattern, name } of ALWAYS_BLOCK_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        blocked = true;
        findings.push({
          type,
          pattern: name,
          match: match[0].slice(0, 20) + "...",
          action: "block",
        });
      }
    }

    // If blocked, return early — no point redacting
    if (blocked) {
      return { blocked, findings, redacted: content };
    }

    // PII patterns
    for (const { subtype, pattern } of PII_PATTERNS) {
      const matches = content.match(new RegExp(pattern.source, "g"));
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "pii",
            pattern: subtype,
            match: match.slice(0, 10) + "...",
            action: this.config.pii_handling,
          });
          if (this.config.pii_handling === "redact") {
            redacted = redacted.replace(match, `[REDACTED:${subtype}]`);
          } else {
            blocked = true;
          }
        }
      }
    }

    // Custom patterns
    for (const { name, regex, action } of this.customRegexes) {
      const matches = content.match(new RegExp(regex.source, "g"));
      if (matches) {
        for (const match of matches) {
          findings.push({
            type: "custom",
            pattern: name,
            match: match.slice(0, 20) + "...",
            action,
          });
          if (action === "redact") {
            redacted = redacted.replace(match, `[REDACTED:${name}]`);
          } else {
            blocked = true;
          }
        }
      }
    }

    return { blocked, findings, redacted };
  }
}
