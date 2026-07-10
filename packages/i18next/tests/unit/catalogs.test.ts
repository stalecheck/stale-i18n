import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseSource } from "@stale-i18n/core";
import { describe, expect, it } from "vitest";
import { readCatalogs } from "../../src/catalogs.js";
import { I18nextChecker } from "../../src/checker.js";
import { analyzeProgram } from "../../src/source-analysis.js";
import type { AnyNode } from "../../src/types.js";

function writeCatalog(root: string, relativePath: string, key = "title") {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ [key]: relativePath }));
}

async function readPattern(root: string, pattern: string) {
  return await readCatalogs({
    target: path.join(root, "src"),
    catalogs: path.join(root, pattern)
  });
}

describe("i18next catalog path metadata", () => {
  it("resolves a default export through a top-level const and prefers it over named exports", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-static-default-catalog-"));
    const catalogPath = path.join(root, "en.ts");
    writeFileSync(
      catalogPath,
      `const metadata = { version: 1 };
const messages = { title: "Title" } as const;
export { metadata };
export default messages;`
    );

    const result = await readCatalogs({ target: path.join(root, "src"), catalogs: catalogPath });

    expect(result.diagnostics).toEqual([]);
    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace: "translation" })
    ]);
  });

  it("resolves one named static catalog export, including an export specifier", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-static-named-catalog-"));
    const catalogPath = path.join(root, "es.ts");
    writeFileSync(
      catalogPath,
      `const messages = { title: "TÃ­tulo" } as const; export { messages };`
    );

    const result = await readCatalogs({ target: path.join(root, "src"), catalogs: catalogPath });

    expect(result.diagnostics).toEqual([]);
    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace: "translation" })
    ]);
  });

  it("rejects ambiguous named exports and CommonJS catalogs", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-invalid-module-catalog-"));
    const ambiguous = path.join(root, "en.ts");
    const commonJs = path.join(root, "es.cjs");
    writeFileSync(
      ambiguous,
      `export const first = { title: "Title" }; export const second = { save: "Save" };`
    );
    writeFileSync(commonJs, `module.exports = { title: "TÃ­tulo" };`);

    const result = await readCatalogs({
      target: path.join(root, "src"),
      catalogs: [ambiguous, commonJs]
    });

    expect(result.entries).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "catalog-parse-error",
        message: expect.stringContaining("multiple named exports")
      }),
      expect.objectContaining({
        code: "catalog-parse-error",
        message: expect.stringContaining("CommonJS catalogs are not supported")
      })
    ]);
  });

  it.each([
    {
      name: "namespace before locale",
      pattern: path.join("src", "ui", "{namespace}", "{locale}.json"),
      file: path.join("src", "ui", "checkout", "es.json"),
      namespace: "checkout",
      locale: "es"
    },
    {
      name: "placeholders embedded in a directory",
      pattern: path.join("translations", "bundle-{locale}--{namespace}", "messages.json"),
      file: path.join("translations", "bundle-ca--account", "messages.json"),
      namespace: "account",
      locale: "ca"
    },
    {
      name: "decorated namespace directory and locale filename",
      pattern: path.join("odd", "area.{namespace}", "catalog+{locale}.json"),
      file: path.join("odd", "area.settings", "catalog+pt-BR.json"),
      namespace: "settings",
      locale: "pt-BR"
    },
    {
      name: "regex metacharacters around both placeholders",
      pattern: path.join("catalogs[old](v2)+", "[{locale}]", "({namespace}).messages.json"),
      file: path.join("catalogs[old](v2)+", "[en-US]", "(billing).messages.json"),
      namespace: "billing",
      locale: "en-US"
    },
    {
      name: "both placeholders in a filename in reverse conventional order",
      pattern: path.join("flat", "ns={namespace}__lng={locale}.json"),
      file: path.join("flat", "ns=admin-panel__lng=zh-Hant-TW.json"),
      namespace: "admin-panel",
      locale: "zh-Hant-TW"
    },
    {
      name: "locale first in a filename with dots as delimiters",
      pattern: path.join("flat", "{locale}.catalog.{namespace}.i18n.json"),
      file: path.join("flat", "pt_BR.catalog.user.profile.i18n.json"),
      namespace: "user.profile",
      locale: "pt_BR"
    },
    {
      name: "unicode directory names and placeholder values",
      pattern: path.join("traduccions-ñ", "idioma={locale}", "espazo={namespace}.json"),
      file: path.join("traduccions-ñ", "idioma=gl-ES", "espazo=conta-pública.json"),
      namespace: "conta-pública",
      locale: "gl-ES"
    },
    {
      name: "spaces in directories and placeholder values",
      pattern: path.join("message bundles", "{namespace}", "locale {locale}.json"),
      file: path.join("message bundles", "customer portal", "locale en GB.json"),
      namespace: "customer portal",
      locale: "en GB"
    },
    {
      name: "deep alternating fixed and dynamic segments",
      pattern: path.join(
        "packages",
        "feature-{namespace}",
        "assets",
        "i18n",
        "release",
        "{locale}",
        "strings.data.json"
      ),
      file: path.join(
        "packages",
        "feature-onboarding",
        "assets",
        "i18n",
        "release",
        "ar-EG",
        "strings.data.json"
      ),
      namespace: "onboarding",
      locale: "ar-EG"
    },
    {
      name: "numeric namespace and locale with an at sign",
      pattern: path.join("generated", "v3-{namespace}", "{locale}@catalog.json"),
      file: path.join("generated", "v3-404", "es-MX@catalog.json"),
      namespace: "404",
      locale: "es-MX"
    },
    {
      name: "braces and dollar signs in fixed path text",
      pattern: path.join("literal-{not-a-placeholder}", "$schema", "{namespace}", "{locale}.json"),
      file: path.join("literal-{not-a-placeholder}", "$schema", "search", "de-CH.json"),
      namespace: "search",
      locale: "de-CH"
    },
    {
      name: "multiple suffixes after the locale placeholder",
      pattern: path.join("modules", "{namespace}.module", "messages.{locale}.prod.min.json"),
      file: path.join("modules", "reports.module", "messages.ja-JP.prod.min.json"),
      namespace: "reports",
      locale: "ja-JP"
    },
    {
      name: "locale directory below a namespaced filename prefix",
      pattern: path.join(
        "domains",
        "translations-{namespace}",
        "regions",
        "lng-{locale}",
        "index.json"
      ),
      file: path.join("domains", "translations-orders", "regions", "lng-ca-ES", "index.json"),
      namespace: "orders",
      locale: "ca-ES"
    }
  ])("extracts metadata from $name", async ({ pattern, file, namespace, locale }) => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-catalog-layout-"));
    writeCatalog(root, file);

    const result = await readPattern(root, pattern);

    expect(result.diagnostics).toEqual([]);
    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace, locale, filePath: path.join(root, file) })
    ]);
    expect(result.localesByNamespace.get(namespace)).toEqual(new Set([locale]));
  });

  it("uses the default namespace when a placeholder pattern only declares locale", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-locale-only-"));
    writeCatalog(root, path.join("messages", "fr.catalog.json"));

    const result = await readPattern(root, path.join("messages", "{locale}.catalog.json"));

    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace: "translation", locale: "fr" })
    ]);
  });

  it("leaves locale undefined when a placeholder pattern only declares namespace", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-namespace-only-"));
    writeCatalog(root, path.join("messages", "checkout.bundle.json"));

    const result = await readPattern(root, path.join("messages", "{namespace}.bundle.json"));

    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace: "checkout" })
    ]);
    expect(result.entries[0]).not.toHaveProperty("locale");
  });

  it("does not invent locale or namespace metadata for a literal catalog path", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-literal-catalog-"));
    const file = path.join("anything", "invented", "layout.data.json");
    writeCatalog(root, file);

    const result = await readPattern(root, file);

    expect(result.entries).toEqual([
      expect.objectContaining({ key: "title", namespace: "translation" })
    ]);
    expect(result.entries[0]).not.toHaveProperty("locale");
  });

  it("respects a custom default namespace for locale-only patterns and literal paths", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-custom-default-"));
    const patternedFile = path.join("by-locale", "eu.json");
    const literalFile = path.join("strange", "tree", "catalog.payload.json");
    writeCatalog(root, patternedFile, "patterned");
    writeCatalog(root, literalFile, "literal");

    const result = await readCatalogs({
      target: path.join(root, "src"),
      catalogs: [path.join(root, "by-locale", "{locale}.json"), path.join(root, literalFile)],
      defaultNamespace: "application"
    });

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "patterned", namespace: "application", locale: "eu" }),
        expect.objectContaining({ key: "literal", namespace: "application" })
      ])
    );
  });

  it("lets explicit path config metadata override both captured placeholders", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-explicit-meta-"));
    writeCatalog(root, path.join("captured-ns", "captured-locale.json"));

    const result = await readCatalogs({
      target: path.join(root, "src"),
      catalogs: {
        type: "path",
        data: path.join(root, "{namespace}", "{locale}.json"),
        namespace: "configured-ns",
        locale: "configured-locale"
      }
    });

    expect(result.entries).toEqual([
      expect.objectContaining({ namespace: "configured-ns", locale: "configured-locale" })
    ]);
    expect(result.localesByNamespace.get("configured-ns")).toEqual(new Set(["configured-locale"]));
  });

  it("keeps metadata isolated across an array of unrelated catalog layouts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-mixed-layouts-"));
    writeCatalog(root, path.join("ui", "checkout", "es.json"), "checkout.title");
    writeCatalog(root, path.join("server", "en-US--errors", "payload.json"), "server.error");
    writeCatalog(root, path.join("legacy", "fr.common.bundle.json"), "legacy.title");

    const result = await readCatalogs({
      target: path.join(root, "src"),
      catalogs: [
        path.join(root, "ui", "{namespace}", "{locale}.json"),
        path.join(root, "server", "{locale}--{namespace}", "payload.json"),
        path.join(root, "legacy", "{locale}.{namespace}.bundle.json")
      ],
      keySeparator: false
    });

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "checkout.title", namespace: "checkout", locale: "es" }),
        expect.objectContaining({ key: "server.error", namespace: "errors", locale: "en-US" }),
        expect.objectContaining({ key: "legacy.title", namespace: "common", locale: "fr" })
      ])
    );
    expect(result.catalogsChecked).toBe(3);
  });

  it("requires repeated locale and namespace placeholders to capture identical values", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-repeated-placeholders-"));
    writeCatalog(root, path.join("en", "common", "common.en.json"), "valid");
    writeCatalog(root, path.join("en", "common", "other.fr.json"), "invalid");

    const result = await readPattern(
      root,
      path.join("{locale}", "{namespace}", "{namespace}.{locale}.json")
    );

    expect(result.entries).toEqual([
      expect.objectContaining({ key: "valid", namespace: "common", locale: "en" })
    ]);
    expect(result.catalogsChecked).toBe(1);
  });

  it("does not match extra nesting or near-miss filename suffixes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-near-misses-"));
    writeCatalog(root, path.join("catalogs", "common", "en.json"), "valid");
    writeCatalog(root, path.join("catalogs", "common", "nested", "en.json"), "too-deep");
    writeCatalog(root, path.join("catalogs", "common", "es.json.backup"), "backup");
    writeCatalog(root, path.join("catalogs", "common-copy", "fr.txt"), "wrong-extension");

    const result = await readPattern(root, path.join("catalogs", "{namespace}", "{locale}.json"));

    expect(result.entries).toEqual([
      expect.objectContaining({ key: "valid", namespace: "common", locale: "en" })
    ]);
    expect(result.catalogsChecked).toBe(1);
  });

  it("fails configuration when an existing catalog root has no matches", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-empty-catalog-root-"));
    const target = path.join(root, "src");
    const catalogRoot = path.join(root, "locales");
    const pattern = path.join(catalogRoot, "{locale}", "{namespace}.json");
    mkdirSync(target, { recursive: true });
    mkdirSync(catalogRoot, { recursive: true });

    const result = await new I18nextChecker({ target, catalogs: pattern }).check();

    expect(result).toEqual({
      status: "FAIL",
      filesChecked: 0,
      catalogsChecked: 0,
      diagnostics: [
        expect.objectContaining({
          code: "catalog-target-not-found",
          severity: "error",
          filePath: pattern
        })
      ]
    });
  });

  it("fails configuration when the catalog target list is empty", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-empty-catalog-list-"));
    const target = path.join(root, "src");
    mkdirSync(target, { recursive: true });

    const result = await new I18nextChecker({ target, catalogs: [] }).check();

    expect(result).toEqual(
      expect.objectContaining({
        status: "FAIL",
        catalogsChecked: 0,
        diagnostics: [
          expect.objectContaining({
            code: "catalog-target-not-found",
            severity: "error",
            message: "No catalog targets were configured."
          })
        ]
      })
    );
  });

  it("rejects invalid runtime options before attempting analysis", async () => {
    const result = await new I18nextChecker({
      target: "src",
      catalogs: "locales/en.json"
    }).check({ keySeparator: "" });

    expect(result).toEqual(
      expect.objectContaining({
        status: "FAIL",
        filesChecked: 0,
        catalogsChecked: 0,
        diagnostics: [expect.objectContaining({ code: "invalid-configuration", severity: "error" })]
      })
    );
  });

  it("rejects resource catalogs that are not non-empty plain objects", async () => {
    const result = await new I18nextChecker({
      target: "src",
      catalogs: { type: "resource", data: null }
    } as never).check();

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "invalid-configuration", severity: "error" })
    ]);
  });

  it("reports every missing source target separately", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "i18next-multiple-targets-"));
    const source = path.join(root, "app.ts");
    const missing = path.join(root, "missing.ts");
    writeFileSync(source, "export const value = 1;");
    writeCatalog(root, "en.json");

    const result = await new I18nextChecker({
      target: [source, missing],
      catalogs: path.join(root, "en.json")
    }).check();

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "source-target-not-found", filePath: missing })
      ])
    );
  });
});

describe("i18next source analysis phases", () => {
  it("collects useTranslation imports before bindings regardless of AST order", async () => {
    const source = `
const { t } = useTranslation("checkout");
export const title = t("title");
import { useTranslation } from "react-i18next";
`;
    const parsed = parseSource("src/app.ts", source);
    expect(parsed.program).not.toBeNull();
    if (parsed.program === null) throw new Error("Expected the test source to parse");

    const result = analyzeProgram(parsed.program as AnyNode, source, "src/app.ts", {
      target: "src",
      catalogs: "locales/{locale}/{namespace}.json"
    });

    expect(result.usages).toEqual([
      expect.objectContaining({
        kind: "resolved",
        message: { id: "title", namespace: "checkout" }
      })
    ]);
  });

  it("does not replace a dynamic namespace or keyPrefix with the defaults", async () => {
    const source = `
import { useTranslation } from "react-i18next";
declare const namespace: string;
declare const prefix: string;
const { t } = useTranslation(namespace, { keyPrefix: prefix });
t("title");
`;
    const parsed = parseSource("src/app.ts", source);
    expect(parsed.program).not.toBeNull();
    if (parsed.program === null) throw new Error("Expected the test source to parse");

    const result = analyzeProgram(parsed.program as AnyNode, source, "src/app.ts", {
      target: "src",
      catalogs: "locales/{locale}/{namespace}.json"
    });

    expect(result.usages).toEqual([
      expect.objectContaining({ kind: "unresolved", reason: "dynamic-key" })
    ]);
  });

  it("enumerates finite static namespaces, key prefixes and contexts", async () => {
    const source = `
import { useTranslation } from "react-i18next";
declare const enabled: boolean;
const namespace = enabled ? "admin" : "account";
const prefix = enabled ? "header" : "footer";
const context = enabled ? "male" : "female";
const { t } = useTranslation(namespace, { keyPrefix: prefix });
t("title", { context });
`;
    const parsed = parseSource("src/app.ts", source);
    expect(parsed.program).not.toBeNull();
    if (parsed.program === null) throw new Error("Expected the test source to parse");

    const result = analyzeProgram(parsed.program as AnyNode, source, "src/app.ts", {
      target: "src",
      catalogs: "locales/{locale}/{namespace}.json"
    });

    expect(result.usages).toHaveLength(8);
    expect(result.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "resolved",
          message: { namespace: "admin", id: "header.title_male" }
        }),
        expect.objectContaining({
          kind: "resolved",
          message: { namespace: "account", id: "footer.title_female" }
        })
      ])
    );
  });

  it("reports dynamic Trans namespace and context instead of using defaults", async () => {
    const source = `
import { Trans } from "react-i18next";
declare const namespace: string;
declare const context: string;
export const view = <Trans i18nKey="title" ns={namespace} context={context} />;
`;
    const parsed = parseSource("src/app.tsx", source);
    expect(parsed.program).not.toBeNull();
    if (parsed.program === null) throw new Error("Expected the test source to parse");

    const result = analyzeProgram(parsed.program as AnyNode, source, "src/app.tsx", {
      target: "src",
      catalogs: "locales/{locale}/{namespace}.json"
    });

    expect(result.usages).toEqual([
      expect.objectContaining({
        kind: "unresolved",
        reason: "dynamic-key",
        sourceKind: "jsx-component"
      })
    ]);
  });
});
