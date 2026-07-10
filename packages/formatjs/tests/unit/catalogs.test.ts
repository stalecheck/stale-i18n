import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogs } from "../../src/catalogs.js";
import { FormatjsChecker } from "../../src/checker.js";

describe("FormatJS catalog path metadata", () => {
  it("resolves a default export through a top-level const and prefers it over named exports", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-static-default-catalog-"));
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
    expect(result.entries).toEqual([expect.objectContaining({ key: "title", locale: "en" })]);
  });

  it("resolves one named static catalog export, including an export specifier", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-static-named-catalog-"));
    const catalogPath = path.join(root, "es.ts");
    writeFileSync(
      catalogPath,
      `const messages = { title: "TÃ­tulo" } as const; export { messages };`
    );

    const result = await readCatalogs({ target: path.join(root, "src"), catalogs: catalogPath });

    expect(result.diagnostics).toEqual([]);
    expect(result.entries).toEqual([expect.objectContaining({ key: "title", locale: "es" })]);
  });

  it("rejects ambiguous named exports and CommonJS catalogs", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-invalid-module-catalog-"));
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

  it("captures locale from its placeholder instead of the file name", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-catalog-layout-"));
    for (const locale of ["en", "es"]) {
      const filePath = path.join(root, "locales", locale, "messages.json");
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify({ title: locale }));
    }

    const result = await readCatalogs({
      target: path.join(root, "src"),
      catalogs: path.join(root, "locales", "{locale}", "messages.json")
    });

    expect(result.locales).toEqual(new Set(["en", "es"]));
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "title", locale: "en" }),
        expect.objectContaining({ key: "title", locale: "es" })
      ])
    );
  });

  it("fails configuration when an existing catalog root has no matches", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-empty-catalog-root-"));
    const target = path.join(root, "src");
    const catalogRoot = path.join(root, "locales");
    const pattern = path.join(catalogRoot, "{locale}.json");
    mkdirSync(target, { recursive: true });
    mkdirSync(catalogRoot, { recursive: true });

    const result = await new FormatjsChecker({ target, catalogs: pattern }).check();

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
    const root = mkdtempSync(path.join(tmpdir(), "formatjs-empty-catalog-list-"));
    const target = path.join(root, "src");
    mkdirSync(target, { recursive: true });

    const result = await new FormatjsChecker({ target, catalogs: [] }).check();

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
});
