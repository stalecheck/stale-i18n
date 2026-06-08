/* eslint-disable vitest/no-conditional-expect, vitest/no-conditional-tests, vitest/valid-title */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RULE_DEFINITIONS,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type RuleLevel,
  type RuleOverrides
} from "@stale-i18n/core";
import { I18nextChecker, type I18nextCheckOptions, type RawTextOptions } from "@stale-i18n/i18next";
import { describe, expect, it } from "vitest";

const usesDir = path.dirname(fileURLToPath(import.meta.url));

type DiagnosticExpectation = Partial<Diagnostic>;

type ResultExpectation = Partial<
  Omit<CheckResult, "diagnostics"> & {
    diagnostics: DiagnosticExpectation[];
    absentDiagnostics: DiagnosticExpectation[];
  }
>;

type RawJsonOptions = Partial<
  Omit<I18nextCheckOptions, "rawText"> & {
    rawText?: Partial<
      Omit<RawTextOptions, "ignore"> & {
        ignore?: Array<string | { regexp: string; flags?: string }>;
      }
    >;
  }
>;

type ExpectedUseCase = {
  options?: RawJsonOptions;
  result?: ResultExpectation;
  variants?: Array<{
    name: string;
    options?: RawJsonOptions;
    result: ResultExpectation;
  }>;
  ruleLevels?: {
    code: RuleCode;
    options?: RawJsonOptions;
  };
};

type UseCase = {
  name: string;
  dir: string;
  expected: ExpectedUseCase;
};

function getUseCases(dir: string = usesDir, prefix = ""): UseCase[] {
  return readdirSync(dir)
    .filter((entry) => !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts"))
    .sort((a, b) => a.localeCompare(b))
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry);

      if (!statSync(entryPath).isDirectory()) {
        return [];
      }

      const name = prefix ? `${prefix}/${entry}` : entry;
      const expectedPath = path.join(entryPath, "expected.json");

      if (existsSync(expectedPath)) {
        return [
          {
            name,
            dir: entryPath,
            expected: JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedUseCase
          }
        ];
      }

      return getUseCases(entryPath, name);
    });
}

function normalizeOptions(
  caseDir: string,
  options: RawJsonOptions = {}
): Partial<I18nextCheckOptions> {
  const { catalogs: rawCatalogs, rawText: rawRawText, target: rawTarget, ...rawRest } = options;
  const normalized: Partial<I18nextCheckOptions> = { ...rawRest };
  const target = resolvePathOption(caseDir, rawTarget);
  const catalogs = resolveCatalogsOption(caseDir, rawCatalogs);
  const rawText = normalizeRawTextOptions(rawRawText);

  if (target !== undefined) {
    normalized.target = target;
  }

  if (catalogs !== undefined) {
    normalized.catalogs = catalogs;
  }

  if (rawText !== undefined) {
    normalized.rawText = rawText;
  }

  return normalized;
}

function buildOptions(caseDir: string, options: RawJsonOptions = {}): I18nextCheckOptions {
  return {
    target: path.join(caseDir, "src"),
    catalogs: path.join(caseDir, "locales", "{locale}", "{namespace}.json"),
    ...normalizeOptions(caseDir, options)
  };
}

function resolvePathOption(caseDir: string, value: string | undefined) {
  if (value === undefined || path.isAbsolute(value)) {
    return value;
  }

  return path.join(caseDir, value);
}

function resolveCatalogsOption(caseDir: string, value: string | string[] | undefined) {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((catalog) => resolveCatalogPath(caseDir, catalog));
  }

  return resolveCatalogPath(caseDir, value);
}

function resolveCatalogPath(caseDir: string, value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(caseDir, value);
}

function normalizeRawTextOptions(
  rawText: RawJsonOptions["rawText"] | undefined
): RawTextOptions | undefined {
  if (rawText === undefined) {
    return undefined;
  }

  const { ignore, ...rest } = rawText;
  const normalized: RawTextOptions = { ...rest };

  if (ignore !== undefined) {
    normalized.ignore = ignore.map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      return new RegExp(entry.regexp, entry.flags);
    });
  }

  return normalized;
}

function expectResult(result: CheckResult, expected: ResultExpectation = {}) {
  const { diagnostics, absentDiagnostics, ...summary } = expected;

  expect(result).toEqual(expect.objectContaining(summary));

  if (diagnostics !== undefined) {
    if (diagnostics.length === 0) {
      expect(result.diagnostics).toEqual([]);
    } else {
      expect(result.diagnostics).toEqual(
        expect.arrayContaining(diagnostics.map((diagnostic) => expect.objectContaining(diagnostic)))
      );
    }
  }

  if (absentDiagnostics !== undefined) {
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining(
        absentDiagnostics.map((diagnostic) => expect.objectContaining(diagnostic))
      )
    );
  }
}

function checkCase(caseDir: string, options: RawJsonOptions = {}) {
  return new I18nextChecker(buildOptions(caseDir, options)).checkSync();
}

function checkRuleLevel(
  caseDir: string,
  code: RuleCode,
  level: RuleLevel,
  options: RawJsonOptions = {}
) {
  const rules: RuleOverrides = {
    ...options.rules,
    [code]: level
  };

  return checkCase(caseDir, {
    ...options,
    rules
  });
}

describe("i18next public API use cases", () => {
  const cases = getUseCases();

  for (const useCase of cases) {
    if (useCase.expected.ruleLevels !== undefined) {
      const { code, options } = useCase.expected.ruleLevels;
      const ruleLevelOptions = {
        ...useCase.expected.options,
        ...options
      };

      it(`${useCase.name} rule is off`, () => {
        expect(RULE_DEFINITIONS[code]).toEqual(expect.objectContaining({ code }));

        const result = checkRuleLevel(useCase.dir, code, "off", ruleLevelOptions);

        expect(result.diagnostics).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ code })])
        );
      });

      it(`${useCase.name} rule is warning`, () => {
        const result = checkRuleLevel(useCase.dir, code, "warning", ruleLevelOptions);

        expectResult(result, {
          status: "SUCCESS",
          diagnostics: [{ code, severity: "warning" }]
        });
      });

      it(`${useCase.name} rule is error`, () => {
        const result = checkRuleLevel(useCase.dir, code, "error", ruleLevelOptions);

        expectResult(result, {
          status: "FAIL",
          diagnostics: [{ code, severity: "error" }]
        });
      });

      continue;
    }

    if (useCase.expected.variants !== undefined) {
      for (const variant of useCase.expected.variants) {
        it(`${useCase.name} ${variant.name}`, () => {
          const result = checkCase(useCase.dir, variant.options);

          expectResult(result, variant.result);
        });
      }

      continue;
    }

    it(useCase.name, () => {
      const result = checkCase(useCase.dir, useCase.expected.options);

      expectResult(result, useCase.expected.result);
    });
  }
});
