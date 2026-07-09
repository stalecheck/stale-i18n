import type { RULE_LEVEL, RuleCode, RuleOverrides } from "./types.js";

export type RuleDefinition = {
  code: RuleCode;
  defaultLevel: RULE_LEVEL;
  description: string;
};

export const RULE_DEFINITIONS = {
  "missing-translation-key": {
    code: "missing-translation-key",
    defaultLevel: "error",
    description: "Translation key is used in source but missing from the catalog."
  },
  "missing-locale-key": {
    code: "missing-locale-key",
    defaultLevel: "error",
    description: "Translation key exists in one locale but is missing from another locale."
  },
  "unused-translation-key": {
    code: "unused-translation-key",
    defaultLevel: "error",
    description: "Translation key is defined in a catalog but never used in source."
  },
  "empty-translation-value": {
    code: "empty-translation-value",
    defaultLevel: "error",
    description: "Translation key has an empty, null, or undefined value."
  },
  "unresolved-dynamic-key": {
    code: "unresolved-dynamic-key",
    defaultLevel: "error",
    description: "Translation key usage could not be resolved statically."
  },
  "raw-ui-text": {
    code: "raw-ui-text",
    defaultLevel: "off",
    description: "Visible or accessible UI text is written directly instead of using i18n."
  },
  "source-parse-error": {
    code: "source-parse-error",
    defaultLevel: "error",
    description: "Source file could not be parsed."
  },
  "catalog-parse-error": {
    code: "catalog-parse-error",
    defaultLevel: "error",
    description: "Catalog file could not be parsed."
  },
  "catalog-file-not-found": {
    code: "catalog-file-not-found",
    defaultLevel: "error",
    description: "Configured catalog file was not found."
  }
} as const satisfies Readonly<Record<RuleCode, RuleDefinition>>;

export function getRuleLevel(
  code: RuleCode,
  rules: RuleOverrides | undefined,
  defaultLevel: RULE_LEVEL = RULE_DEFINITIONS[code].defaultLevel
): RULE_LEVEL {
  return rules?.[code] ?? defaultLevel;
}
