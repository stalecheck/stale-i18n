import { createDiagnostic, type Diagnostic, type SourceUsage } from "@stale-i18n/core";
import type { CatalogEntry, CatalogReadResult, ParaglideCheckOptions } from "./types.js";

export function compareUsages(
  usages: SourceUsage[],
  catalogs: CatalogReadResult,
  options: ParaglideCheckOptions
): Array<Diagnostic | null> {
  const diagnostics: Array<Diagnostic | null> = [];
  const catalogKeys = new Map<string, CatalogEntry[]>();
  for (const entry of catalogs.entries) {
    const existing = catalogKeys.get(entry.key) ?? [];
    existing.push(entry);
    catalogKeys.set(entry.key, existing);
  }

  const usedIds = new Set<string>();
  for (const usage of usages) {
    if (usage.kind === "unresolved") {
      diagnostics.push(
        createDiagnostic({
          code: "unresolved-dynamic-key",
          rules: options.rules,
          message: "Translation key could not be resolved statically",
          filePath: usage.filePath,
          line: usage.location.line,
          column: usage.location.column
        })
      );
      continue;
    }

    usedIds.add(usage.message.id);
    if (!catalogKeys.has(usage.message.id)) {
      diagnostics.push(
        createDiagnostic({
          code: "missing-translation-key",
          rules: options.rules,
          message: `Missing translation key "${usage.message.id}"`,
          filePath: usage.filePath,
          line: usage.location.line,
          column: usage.location.column,
          key: usage.message.id
        })
      );
    }
  }

  for (const [key, entries] of catalogKeys) {
    const locales = new Map(entries.map((entry) => [entry.locale, entry]));
    const first = entries[0]!;

    for (const locale of catalogs.locales) {
      if (!locales.has(locale)) {
        diagnostics.push(
          createDiagnostic({
            code: "missing-locale-key",
            rules: options.rules,
            message: `Translation key "${key}" is missing in locale "${locale}"`,
            filePath: first.filePath,
            catalogPath: first.filePath,
            line: 1,
            column: 1,
            key,
            locale
          })
        );
      }
    }

    for (const entry of entries) {
      if (
        entry.value === null ||
        entry.value === undefined ||
        (typeof entry.value === "string" && entry.value.trim() === "")
      ) {
        diagnostics.push(
          createDiagnostic({
            code: "empty-translation-value",
            rules: options.rules,
            message: `Translation key "${entry.key}" has an empty value`,
            filePath: entry.filePath,
            catalogPath: entry.filePath,
            line: 1,
            column: 1,
            key: entry.key,
            locale: entry.locale
          })
        );
      }
    }

    if (!usedIds.has(key)) {
      diagnostics.push(
        createDiagnostic({
          code: "unused-translation-key",
          rules: options.rules,
          message: `Translation key "${key}" is never used`,
          filePath: first.filePath,
          catalogPath: first.filePath,
          line: 1,
          column: 1,
          key,
          locale: first.locale
        })
      );
    }
  }

  return diagnostics;
}
