/* eslint-disable vitest/no-conditional-expect, vitest/no-conditional-tests, vitest/valid-title */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RULE_DEFINITIONS,
  type RULE_LEVEL,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type RuleOverrides
} from "@stale-i18n/core";
import { ParaglideChecker, type ParaglideCheckOptions } from "@stale-i18n/paraglide";
import { describe, expect, it } from "vitest";

const usesDir = path.dirname(fileURLToPath(import.meta.url));

type DiagnosticExpectation = Partial<Diagnostic>;

type ResultExpectation = Partial<
  Omit<CheckResult, "diagnostics"> & {
    diagnostics: DiagnosticExpectation[];
  }
>;

type ExpectedUseCase = {
  api?: "async" | "sync";
  options?: Partial<ParaglideCheckOptions>;
  result?: ResultExpectation;
  variants?: Array<{
    name: string;
    options?: Partial<ParaglideCheckOptions>;
    result: ResultExpectation;
  }>;
  ruleLevels?: {
    code: RuleCode;
    options?: Partial<ParaglideCheckOptions>;
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
      const expectedPath = path.join(entryPath, "expected.json");
      const name = prefix ? `${prefix}/${entry}` : entry;

      if (!statSync(entryPath).isDirectory()) {
        return [];
      }

      if (!existsSync(expectedPath)) {
        return getUseCases(entryPath, name);
      }

      return [
        {
          name,
          dir: entryPath,
          expected: JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedUseCase
        }
      ];
    });
}

function checkCase(caseDir: string, options: Partial<ParaglideCheckOptions> = {}) {
  return new ParaglideChecker(buildOptions(caseDir, options)).checkSync();
}

async function checkUseCase(useCase: UseCase) {
  const checker = new ParaglideChecker(buildOptions(useCase.dir, useCase.expected.options));
  return useCase.expected.api === "async" ? checker.check() : checker.checkSync();
}

function checkRuleLevel(
  caseDir: string,
  code: RuleCode,
  level: RULE_LEVEL,
  options: Partial<ParaglideCheckOptions> = {}
) {
  const rules: RuleOverrides = {
    ...options.rules,
    [code]: level
  };

  return checkCase(caseDir, { ...options, rules });
}

function buildOptions(caseDir: string, options: Partial<ParaglideCheckOptions> = {}) {
  return {
    target: path.join(caseDir, "src"),
    catalogs: path.join(caseDir, "messages", "{locale}.json"),
    ...resolveOptions(caseDir, options)
  };
}

function resolveOptions(
  caseDir: string,
  options: Partial<ParaglideCheckOptions>
): Partial<ParaglideCheckOptions> {
  const resolved: Partial<ParaglideCheckOptions> = { ...options };
  if (options.target !== undefined) {
    resolved.target = resolveTargetOption(caseDir, options.target);
  }
  if (typeof options.catalogs === "string" && !path.isAbsolute(options.catalogs)) {
    resolved.catalogs = path.join(caseDir, options.catalogs);
  }
  if (Array.isArray(options.catalogs)) {
    resolved.catalogs = options.catalogs.map((catalog) =>
      path.isAbsolute(catalog) ? catalog : path.join(caseDir, catalog)
    );
  }
  return resolved;
}

function resolveTargetOption(
  caseDir: string,
  target: NonNullable<ParaglideCheckOptions["target"]>
) {
  if (Array.isArray(target)) {
    return target.map((entry) => resolvePathOption(caseDir, entry));
  }
  return resolvePathOption(caseDir, target);
}

function resolvePathOption(caseDir: string, value: string) {
  return path.isAbsolute(value) ? value : path.join(caseDir, value);
}

function expectResult(result: CheckResult, expected: ResultExpectation = {}) {
  const { diagnostics, ...summary } = expected;

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
}

describe("paraglide public API use cases", () => {
  for (const useCase of getUseCases()) {
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
          expectResult(checkCase(useCase.dir, variant.options), variant.result);
        });
      }

      continue;
    }

    it(useCase.name, async () => {
      expectResult(await checkUseCase(useCase), useCase.expected.result);
    });
  }
});
