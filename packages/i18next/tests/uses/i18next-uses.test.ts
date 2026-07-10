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
import {
  CatalogConfigI18n,
  I18nextChecker,
  type I18nextCatalogInput,
  type I18nextCheckOptions
} from "@stale-i18n/i18next";
import { createInstance, type i18n } from "i18next";
import { describe, expect, it } from "vitest";

const usesDir = path.dirname(fileURLToPath(import.meta.url));

type DiagnosticExpectation = Partial<Diagnostic>;

type ResultExpectation = Partial<
  Omit<CheckResult, "diagnostics"> & {
    diagnostics: DiagnosticExpectation[];
    absentDiagnostics: DiagnosticExpectation[];
  }
>;

type RawJsonOptions = Partial<I18nextCheckOptions>;

type ExpectedUseCase = {
  api?: "async" | "sync";
  options?: RawJsonOptions;
  runtimeI18nInstances?: RuntimeI18nInstanceConfig[];
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

type RuntimeI18nInstanceConfig = {
  bundles: Array<{
    locale: string;
    namespace: string;
    resources: Record<string, unknown>;
  }>;
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
  const { catalogs: rawCatalogs, target: rawTarget, ...rawRest } = options;
  const normalized: Partial<I18nextCheckOptions> = { ...rawRest };
  const target = resolvePathOption(caseDir, rawTarget);
  const catalogs = resolveCatalogsOption(caseDir, rawCatalogs);

  if (target !== undefined) {
    normalized.target = target;
  }

  if (catalogs !== undefined) {
    normalized.catalogs = catalogs;
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

function resolvePathOption(caseDir: string, value: I18nextCheckOptions["target"] | undefined) {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (path.isAbsolute(entry) ? entry : path.join(caseDir, entry)));
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(caseDir, value);
}

function resolveCatalogsOption(
  caseDir: string,
  value: I18nextCheckOptions["catalogs"] | undefined
): I18nextCheckOptions["catalogs"] | undefined {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((catalog) => resolveCatalogOption(caseDir, catalog));
  }

  return resolveCatalogOption(caseDir, value);
}

function resolveCatalogOption(caseDir: string, value: I18nextCatalogInput) {
  if (typeof value === "object" && value.type === "path") {
    return {
      ...value,
      data: resolveCatalogPath(caseDir, value.data)
    };
  }

  if (typeof value === "object") {
    return value;
  }

  return resolveCatalogPath(caseDir, value);
}

function resolveCatalogPath(caseDir: string, value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.join(caseDir, value);
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
  return new I18nextChecker(buildOptions(caseDir, options)).check();
}

async function checkUseCase(useCase: UseCase) {
  const checker = new I18nextChecker(
    await buildUseCaseOptions(useCase.dir, useCase.expected.options, useCase.expected)
  );
  return useCase.expected.api === "async" ? checker.check() : checker.check();
}

async function buildUseCaseOptions(
  caseDir: string,
  options: RawJsonOptions = {},
  expected: ExpectedUseCase
): Promise<I18nextCheckOptions> {
  const builtOptions = buildOptions(caseDir, options);

  if (expected.runtimeI18nInstances === undefined) {
    return builtOptions;
  }

  const instances = await Promise.all(
    expected.runtimeI18nInstances.map((config) => createRuntimeI18n(config.bundles))
  );

  return {
    ...builtOptions,
    catalogs: CatalogConfigI18n.fromI18nInstances(instances)
  };
}

function checkRuleLevel(
  caseDir: string,
  code: RuleCode,
  level: RULE_LEVEL,
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

      it(`${useCase.name} rule is off`, async () => {
        expect(RULE_DEFINITIONS[code]).toEqual(expect.objectContaining({ code }));

        const result = await checkRuleLevel(useCase.dir, code, "off", ruleLevelOptions);

        expect(result.diagnostics).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ code })])
        );
      });

      it(`${useCase.name} rule is warning`, async () => {
        const result = await checkRuleLevel(useCase.dir, code, "warning", ruleLevelOptions);

        expectResult(result, {
          status: "SUCCESS",
          diagnostics: [{ code, severity: "warning" }]
        });
      });

      it(`${useCase.name} rule is error`, async () => {
        const result = await checkRuleLevel(useCase.dir, code, "error", ruleLevelOptions);

        expectResult(result, {
          status: "FAIL",
          diagnostics: [{ code, severity: "error" }]
        });
      });

      continue;
    }

    if (useCase.expected.variants !== undefined) {
      for (const variant of useCase.expected.variants) {
        it(`${useCase.name} ${variant.name}`, async () => {
          const result = await checkCase(useCase.dir, variant.options);

          expectResult(result, variant.result);
        });
      }

      continue;
    }

    it(useCase.name, async () => {
      const result = await checkUseCase(useCase);

      expectResult(result, useCase.expected.result);
    });
  }
});

describe("i18next conservative plural families", () => {
  const fixturesDir = path.join(usesDir, "..", "fixtures");

  it("accepts partial, locale-specific, contextual, ordinal and Trans plural families", async () => {
    const result = await checkCase(path.join(fixturesDir, "plural-families-success"));

    expect(result).toEqual({
      status: "SUCCESS",
      diagnostics: [],
      filesChecked: 1,
      catalogsChecked: 2
    });
  });

  it("reports only a family missing from a locale or from every catalog", async () => {
    const result = await checkCase(path.join(fixturesDir, "plural-family-missing"));

    expect(
      result.diagnostics.map(({ code, key, locale }) => ({
        code,
        key,
        ...(locale === undefined ? {} : { locale })
      }))
    ).toEqual([
      {
        code: "missing-locale-key",
        key: "presentInOneLocale",
        locale: "ar"
      },
      {
        code: "missing-translation-key",
        key: "absentEverywhere"
      }
    ]);
  });

  it("does not consume a non-plural key that merely shares the prefix", async () => {
    const result = await checkCase(path.join(fixturesDir, "plural-family-lookalike"));

    expect(result.diagnostics.map(({ code, key }) => ({ code, key }))).toEqual([
      { code: "unused-translation-key", key: "items_archive" }
    ]);
  });
});

async function createRuntimeI18n(
  bundles: Array<{
    locale: string;
    namespace: string;
    resources: Record<string, unknown>;
  }>
): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: "en",
    fallbackLng: "en"
  });

  for (const bundle of bundles) {
    instance.addResourceBundle(bundle.locale, bundle.namespace, bundle.resources);
  }

  return instance;
}
