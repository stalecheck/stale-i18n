import {
  createConfigurationDiagnostic,
  createDiagnostic,
  createResult,
  parseSource,
  discoverSourceFiles,
  formatSourceTarget,
  isConfigurationDiagnostic,
  sourceTargetMissing,
  validateBaseCheckOptions,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type TranslationChecker
} from "@stale-i18n/core";
import { readFile } from "node:fs/promises";
import { readCatalogs } from "./catalogs.js";
import { compareUsages } from "./comparison.js";
import { analyzeProgram } from "./source-analysis.js";
import type { AnyNode, I18nextCheckOptions, I18nextSourceUsage } from "./types.js";

export class I18nextChecker implements TranslationChecker<I18nextCheckOptions> {
  readonly name = "i18next";
  readonly options: Readonly<I18nextCheckOptions>;

  constructor(options: I18nextCheckOptions) {
    this.options = options;
  }

  async check(options?: Partial<I18nextCheckOptions>): Promise<CheckResult> {
    const merged = { ...this.options, ...options };
    const validationIssues = validateI18nextOptions(merged);
    if (validationIssues.length > 0) {
      return createResult(
        validationIssues.map((message) =>
          createConfigurationDiagnostic({
            code: "invalid-configuration",
            message,
            filePath: process.cwd(),
            line: 1,
            column: 1
          })
        ),
        0,
        0
      );
    }
    const target = merged.target ?? process.cwd();
    const [missingTargets, sourceFiles, catalogResult] = await Promise.all([
      sourceTargetMissing(target),
      discoverSourceFiles(target, merged.ignorePaths),
      readCatalogs(merged)
    ]);
    const diagnostics: Array<Diagnostic | null> = [
      ...missingTargets.map((missingTarget) =>
        createConfigurationDiagnostic({
          code: "source-target-not-found",
          message: `Source target was not found: ${formatSourceTarget(missingTarget)}`,
          filePath: formatSourceTarget(missingTarget),
          line: 1,
          column: 1
        })
      ),
      ...catalogResult.diagnostics
    ];
    const usages: I18nextSourceUsage[] = [];

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      const parsed = parseSource(filePath, source);
      diagnostics.push(
        ...parsed.diagnostics.map((diagnostic) =>
          createDiagnostic({
            code: diagnostic.code as RuleCode,
            rules: merged.rules,
            message: diagnostic.message,
            filePath: diagnostic.filePath,
            line: diagnostic.line,
            column: diagnostic.column,
            key: diagnostic.key,
            locale: diagnostic.locale,
            catalogPath: diagnostic.catalogPath
          })
        )
      );
      if (parsed.program === null) {
        continue;
      }
      const analyzed = analyzeProgram(parsed.program as AnyNode, source, filePath, merged);
      usages.push(...analyzed.usages);
      diagnostics.push(...analyzed.diagnostics);
    }

    if (missingTargets.length === 0 && !catalogResult.diagnostics.some(isConfigurationDiagnostic)) {
      diagnostics.push(...compareUsages(usages, catalogResult, merged));
    }
    return createResult(diagnostics, sourceFiles.length, catalogResult.catalogsChecked);
  }
}

function validateI18nextOptions(options: unknown): string[] {
  const issues = validateBaseCheckOptions(options);
  if (options === null || typeof options !== "object" || Array.isArray(options)) return issues;
  const value = options as Record<string, unknown>;
  const catalogs = Array.isArray(value.catalogs) ? value.catalogs : [value.catalogs];
  if (catalogs.length > 0 && catalogs.some((catalog) => !isCatalogInput(catalog))) {
    issues.push("catalogs must be a catalog path or an array of valid path/resource configs.");
  }
  for (const field of ["defaultNamespace", "keySeparator", "namespaceSeparator"] as const) {
    const fieldValue = value[field];
    const valid =
      fieldValue === undefined ||
      typeof fieldValue === "string" ||
      ((field === "keySeparator" || field === "namespaceSeparator") && fieldValue === false);
    if (!valid || (typeof fieldValue === "string" && fieldValue.length === 0)) {
      issues.push(
        `${field} must be a non-empty string${field === "defaultNamespace" ? "" : " or false"}.`
      );
    }
  }
  if (value.mode !== undefined && value.mode !== "jsx") issues.push('mode must be "jsx".');
  return issues;
}

function isCatalogInput(value: unknown): boolean {
  if (typeof value === "string") return value.length > 0;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const catalog = value as Record<string, unknown>;
  if (catalog.type === "path") {
    return (
      typeof catalog.data === "string" &&
      catalog.data.length > 0 &&
      optionalMetadataIsValid(catalog)
    );
  }
  return (
    catalog.type === "resource" && isPlainCatalog(catalog.data) && optionalMetadataIsValid(catalog)
  );
}

function optionalMetadataIsValid(catalog: Record<string, unknown>): boolean {
  return ["namespace", "locale", "filePath"].every(
    (field) => catalog[field] === undefined || typeof catalog[field] === "string"
  );
}

function isPlainCatalog(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}
