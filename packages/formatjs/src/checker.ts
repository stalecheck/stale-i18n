import {
  createDiagnostic,
  createResult,
  parseSource,
  type CheckResult,
  type Diagnostic,
  type SourceUsage,
  type TranslationChecker
} from "@stale-i18n/core";
import { readFileSync } from "node:fs";
import { readCatalogs } from "./catalogs.js";
import { compareUsages } from "./comparison.js";
import { discoverSourceFiles } from "./files.js";
import { analyzeProgram } from "./source-analysis.js";
import type { AnyNode, FormatjsCheckOptions } from "./types.js";

export class FormatjsChecker implements TranslationChecker<FormatjsCheckOptions> {
  readonly name = "formatjs";
  readonly options: Readonly<FormatjsCheckOptions>;

  constructor(options: FormatjsCheckOptions) {
    this.options = options;
  }

  async check(options?: Partial<FormatjsCheckOptions>): Promise<CheckResult> {
    return this.checkSync(options);
  }

  checkSync(options?: Partial<FormatjsCheckOptions>): CheckResult {
    const merged = { ...this.options, ...options };
    const sourceFiles = discoverSourceFiles(merged.target ?? process.cwd(), merged.ignore ?? []);
    const catalogResult = readCatalogs(merged);
    const diagnostics: Array<Diagnostic | null> = [...catalogResult.diagnostics];
    const usages: SourceUsage[] = [];

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");
      const parsed = parseSource(filePath, source);
      diagnostics.push(
        ...parsed.diagnostics.map((diagnostic) =>
          createDiagnostic({
            code: diagnostic.code,
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

    diagnostics.push(...compareUsages(usages, catalogResult, merged));
    return createResult(diagnostics, sourceFiles.length, catalogResult.catalogsChecked);
  }
}
