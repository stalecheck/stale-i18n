import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogs } from "../../src/catalogs.js";

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
});
