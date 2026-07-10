import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogs } from "../../src/catalogs.js";
import { ParaglideChecker } from "../../src/checker.js";

describe("Paraglide catalog path metadata", () => {
  it("captures locale from its placeholder instead of the file name", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paraglide-catalog-layout-"));
    for (const locale of ["en", "es"]) {
      const filePath = path.join(root, "messages", locale, "catalog.json");
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify({ title: locale }));
    }

    const result = readCatalogs({
      target: path.join(root, "src"),
      catalogs: path.join(root, "messages", "{locale}", "catalog.json")
    });

    expect(result.locales).toEqual(new Set(["en", "es"]));
    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "title", locale: "en" }),
        expect.objectContaining({ key: "title", locale: "es" })
      ])
    );
  });

  it("fails configuration when an existing catalog root has no matches", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paraglide-empty-catalog-root-"));
    const target = path.join(root, "src");
    const catalogRoot = path.join(root, "messages");
    const pattern = path.join(catalogRoot, "{locale}.json");
    mkdirSync(target, { recursive: true });
    mkdirSync(catalogRoot, { recursive: true });

    const result = new ParaglideChecker({ target, catalogs: pattern }).checkSync();

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

  it("fails configuration when the catalog target list is empty", () => {
    const root = mkdtempSync(path.join(tmpdir(), "paraglide-empty-catalog-list-"));
    const target = path.join(root, "src");
    mkdirSync(target, { recursive: true });

    const result = new ParaglideChecker({ target, catalogs: [] }).checkSync();

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
