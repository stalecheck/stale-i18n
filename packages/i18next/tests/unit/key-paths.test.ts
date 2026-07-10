import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { I18nextChecker, type I18nextCheckOptions } from "@stale-i18n/i18next";
import { describe, expect, it } from "vitest";

function check(
  source: string,
  catalog: unknown,
  options: Pick<I18nextCheckOptions, "keySeparator" | "namespaceSeparator"> = {}
) {
  const root = mkdtempSync(path.join(tmpdir(), "i18next-key-paths-"));
  const sourcePath = path.join(root, "app.tsx");
  writeFileSync(sourcePath, source);

  return new I18nextChecker({
    target: sourcePath,
    catalogs: {
      type: "resource",
      namespace: "translation",
      locale: "en",
      data: catalog
    },
    ...options
  }).checkSync();
}

describe("i18next key paths", () => {
  it("matches nested catalog paths using a custom separator", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("section/title");
`,
      { section: { title: "Title" } },
      { keySeparator: "/" }
    );

    expect(result).toEqual({
      status: "SUCCESS",
      diagnostics: [],
      filesChecked: 1,
      catalogsChecked: 1
    });
  });

  it("does not treat the default separator as a path separator when a custom one is configured", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("section.title");
`,
      { section: { title: "Title" } },
      { keySeparator: "/" }
    );

    expect(result.diagnostics.map(({ code, key }) => ({ code, key }))).toEqual([
      { code: "missing-translation-key", key: "section.title" },
      { code: "unused-translation-key", key: "section/title" }
    ]);
  });

  it("combines keyPrefix with the configured separator", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation("translation", { keyPrefix: "section" });
t("title");
t("missing");
`,
      { section: { title: "Title" } },
      { keySeparator: "/" }
    );

    expect(result.diagnostics.map(({ code, key }) => ({ code, key }))).toEqual([
      { code: "missing-translation-key", key: "section/missing" }
    ]);
  });

  it("keeps flat catalog keys literal when keySeparator is false", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation("translation", { keyPrefix: "section" });
t("title");
`,
      { "section.title": "Title" },
      { keySeparator: false }
    );

    expect(result).toEqual({
      status: "SUCCESS",
      diagnostics: [],
      filesChecked: 1,
      catalogsChecked: 1
    });
  });

  it("applies plural suffixes to the final segment of a custom path", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("cart/items", { count: 2 });
`,
      { cart: { items_one: "One item", items_other: "Many items" } },
      { keySeparator: "/" }
    );

    expect(result).toEqual({
      status: "SUCCESS",
      diagnostics: [],
      filesChecked: 1,
      catalogsChecked: 1
    });
  });

  it("resolves nested translation references with a custom separator", () => {
    const result = check(
      `
import { useTranslation } from "react-i18next";
const { t } = useTranslation();
t("section/title");
`,
      {
        section: { title: "$t(shared/label)" },
        shared: { label: "Shared label" }
      },
      { keySeparator: "/" }
    );

    expect(result).toEqual({
      status: "SUCCESS",
      diagnostics: [],
      filesChecked: 1,
      catalogsChecked: 1
    });
  });
});
