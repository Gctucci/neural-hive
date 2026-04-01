import { describe, it, expect } from "vitest";
import { SecurityScanner, type ScanResult } from "../scanner";

describe("SecurityScanner", () => {
  const scanner = new SecurityScanner({
    sensitive_data: "block",
    pii_handling: "redact",
    custom_patterns: [],
    vault_audit: true,
  });

  describe("API key detection", () => {
    it("blocks OpenAI API keys", () => {
      const result = scanner.scan("My key is sk-proj-abc123def456ghi789");
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("blocks AWS access keys", () => {
      const result = scanner.scan("aws_key=AKIAIOSFODNN7EXAMPLE");
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("blocks GitHub tokens", () => {
      const result = scanner.scan("token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(result.blocked).toBe(true);
    });

    it("blocks Slack tokens", () => {
      const result = scanner.scan("SLACK_TOKEN=xoxb-123456789-abcdef");
      expect(result.blocked).toBe(true);
    });

    it("blocks bearer tokens", () => {
      const result = scanner.scan('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoidmFsdWUifQ.abc123');
      expect(result.blocked).toBe(true);
    });
  });

  describe("credential detection", () => {
    it("blocks password assignments", () => {
      const result = scanner.scan('password=hunter2');
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("credential");
    });

    it("blocks connection strings with credentials", () => {
      const result = scanner.scan("postgres://user:secret@host:5432/db");
      expect(result.blocked).toBe(true);
    });

    it("blocks secret assignments", () => {
      const result = scanner.scan("CLIENT_SECRET=abcdef123456");
      expect(result.blocked).toBe(true);
    });
  });

  describe("private key detection", () => {
    it("blocks PEM private keys", () => {
      const result = scanner.scan("-----BEGIN RSA PRIVATE KEY-----\nMIIE...");
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("private_key");
    });
  });

  describe("environment variable detection", () => {
    it("blocks export SECRET lines", () => {
      const result = scanner.scan('export SECRET_KEY="mysecret123"');
      expect(result.blocked).toBe(true);
      expect(result.findings[0].type).toBe("env_variable");
    });
  });

  describe("PII handling", () => {
    it("redacts email addresses", () => {
      const result = scanner.scan("Contact me at user@example.com");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:email]");
    });

    it("redacts phone numbers", () => {
      const result = scanner.scan("Call me at +1-555-123-4567");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:phone]");
    });
  });

  describe("safe content", () => {
    it("passes clean text through", () => {
      const result = scanner.scan("This project uses TypeScript and React for the frontend.");
      expect(result.blocked).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.redacted).toBe("This project uses TypeScript and React for the frontend.");
    });

    it("does not flag code that mentions keys conceptually", () => {
      const result = scanner.scan("The API key should be stored in environment variables, never in code.");
      expect(result.blocked).toBe(false);
    });
  });

  describe("custom patterns", () => {
    const customScanner = new SecurityScanner({
      sensitive_data: "block",
      pii_handling: "redact",
      custom_patterns: [
        { name: "internal-urls", pattern: "https://internal\\.company\\..*", action: "redact" },
      ],
      vault_audit: true,
    });

    it("redacts custom patterns", () => {
      const result = customScanner.scan("Check https://internal.company.com/dashboard");
      expect(result.blocked).toBe(false);
      expect(result.redacted).toContain("[REDACTED:internal-urls]");
    });
  });
});
