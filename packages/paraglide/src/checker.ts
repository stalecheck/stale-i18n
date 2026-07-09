import {
  createConfigurationDiagnostic,
  createDiagnostic,
  createResult,
  discoverSourceFiles,
  parseSource,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type SourceUsage,
  type TranslationChecker
} from "@stale-i18n/core";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
    return this.checkSync(options);
  }

  checkSync(options?: Partial<ParaglideCheckOptions>): CheckResult {
    const merged = { ...this.options, ...options };
    const target = merged.target ?? process.cwd();
    const absoluteTarget = path.resolve(target);
    const targetExists = existsSync(absoluteTarget);
    const sourceFiles = discoverSourceFiles(target, merged.ignore ?? []);
    const catalogResult = readCatalogs(merged);
    const diagnostics: Array<Diagnostic | null> = [
      targetExists
        ? null
        : createConfigurationDiagnostic({
            code: "source-target-not-found",
            message: `Source target was not found: ${absoluteTarget}`,
            filePath: absoluteTarget,
            line: 1,
            column: 1
          }),
      ...catalogResult.diagnostics
    ];
    const usages: SourceUsage[] = [];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");
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

    if (targetExists) {
      diagnostics.push(...compareUsages(usages, catalogResult, merged));
    }
    return createResult(diagnostics, sourceFiles.length, catalogResult.catalogsChecked);
  }
}
