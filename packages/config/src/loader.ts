import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";
import { NeuroclawConfigSchema, type NeuroclawConfig } from "./schema";

/**
 * Deep merge two plain objects. Arrays are replaced, not merged.
 * Later values override earlier values.
 */
export function mergeConfigs(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key]) &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeConfigs(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Resolve a store path: expand ~, replace ${agent.id}.
 */
export function resolveStorePath(
  storePath: string,
  agentId?: string
): string {
  let resolved = storePath;
  if (resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  }
  if (agentId) {
    resolved = resolved.replace("${agent.id}", agentId);
  }
  // Normalize and remove trailing separator
  resolved = path.normalize(resolved);
  if (resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }
  return resolved;
}

function loadYamlFile(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  return (yaml.load(content) as Record<string, any>) ?? {};
}

/**
 * Load config from a config directory.
 * Merge order: base.yaml → platform.yaml → user.yaml → agents/{agentId}.yaml
 * Validates against schema. Throws on invalid config.
 */
export function loadConfig(
  configDir: string,
  agentId?: string
): NeuroclawConfig {
  const base = loadYamlFile(path.join(configDir, "base.yaml")) ?? {};
  const platform = loadYamlFile(path.join(configDir, "platform.yaml")) ?? {};
  const user = loadYamlFile(path.join(configDir, "user.yaml")) ?? {};

  let agent = {};
  if (agentId) {
    agent =
      loadYamlFile(path.join(configDir, "agents", `${agentId}.yaml`)) ?? {};
  }

  const merged = mergeConfigs(
    mergeConfigs(mergeConfigs(base, platform), user),
    agent
  );

  return NeuroclawConfigSchema.parse(merged);
}
