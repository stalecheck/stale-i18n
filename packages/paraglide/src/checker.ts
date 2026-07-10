import {
  createConfigurationDiagnostic,
  createDiagnostic,
  createResult,
  discoverSourceFiles,
  formatSourceTarget,
  isConfigurationDiagnostic,
  parseSource,
  sourceTargetMissing,
  validateBaseCheckOptions,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type SourceUsage,
  type TranslationChecker
} from "@stale-i18n/core";
import { readFile } from "node:fs/promises";
import { readCatalogs } from "./catalogs.js";
import { compareUsages } from "./comparison.js";
import { analyzeProgram } from "./source-analysis.js";
import type { AnyNode, ParaglideCheckOptions } from "./types.js";

export class ParaglideChecker implements TranslationChecker<ParaglideCheckOptions> {
  readonly name = "paraglide";
  readonly options: Readonly<ParaglideCheckOptions>;

  constructor(options: ParaglideCheckOptions) {
    this.options = options;
  }

  async check(options?: Partial<ParaglideCheckOptions>): Promise<CheckResult> {
    const merged = { ...this.options, ...options };
    const validationIssues = validateCatalogOptions(merged);
    if (validationIssues.length > 0) return invalidConfigurationResult(validationIssues);
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
    const usages: SourceUsage[] = [];

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

      usages.push(...analyzeProgram(parsed.program as AnyNode, source, filePath));
    }

    if (missingTargets.length === 0 && !catalogResult.diagnostics.some(isConfigurationDiagnostic)) {
      diagnostics.push(...compareUsages(usages, catalogResult, merged));
    }
    return createResult(diagnostics, sourceFiles.length, catalogResult.catalogsChecked);
  }
}

function validateCatalogOptions(options: unknown): string[] {
  const issues = validateBaseCheckOptions(options);
  if (options === null || typeof options !== "object" || Array.isArray(options)) return issues;
  const catalogs = (options as Record<string, unknown>).catalogs;
  if (
    (typeof catalogs !== "string" || catalogs.length === 0) &&
    (!Array.isArray(catalogs) ||
      (catalogs.length > 0 &&
        catalogs.some((catalog) => typeof catalog !== "string" || catalog.length === 0)))
  ) {
    issues.push("catalogs must be a catalog path or an array of catalog paths.");
  }
  return issues;
}

function invalidConfigurationResult(issues: string[]): CheckResult {
  return createResult(
    issues.map((message) =>
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
