import { RULE_DEFINITIONS } from "./rules.js";
import type { BaseCheckOptions, RuleCode } from "./types.js";

export function validateBaseCheckOptions(options: unknown): string[] {
  if (!isRecord(options)) return ["Options must be an object."];

  const issues: string[] = [];
  if (options.target !== undefined && !isSourceTarget(options.target)) {
    issues.push("target must be a string or a non-empty array of strings.");
  }
  if (options.ignorePaths !== undefined && !isStringArray(options.ignorePaths)) {
    issues.push("ignorePaths must be an array of strings.");
  }
  if (options.rules !== undefined) {
    if (!isRecord(options.rules)) {
      issues.push("rules must be an object.");
    } else {
      for (const [code, level] of Object.entries(options.rules)) {
        if (!(code in RULE_DEFINITIONS)) {
          issues.push(`rules contains an unknown rule: ${code}.`);
        } else if (level !== "off" && level !== "warning" && level !== "error") {
          issues.push(`rules.${code} must be "off", "warning", or "error".`);
        }
      }
    }
  }
  return issues;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSourceTarget(value: unknown): value is BaseCheckOptions["target"] {
  return (
    (typeof value === "string" && value.length > 0) ||
    (isStringArray(value) && value.length > 0 && value.every((item) => item.length > 0))
  );
}

export function isRuleCode(value: string): value is RuleCode {
  return value in RULE_DEFINITIONS;
}
