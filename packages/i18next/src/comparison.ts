import { createDiagnostic, type Diagnostic, type SourceUsage } from "@stale-i18n/core";
import type { CatalogEntry, CatalogReadResult, I18nextCheckOptions } from "./types.js";

export function compareUsages(
  usages: SourceUsage[],
  catalogs: CatalogReadResult,
  options: I18nextCheckOptions
): Array<Diagnostic | null> {
  const diagnostics: Array<Diagnostic | null> = [];
  const catalogKeys = new Map<string, CatalogEntry[]>();
  for (const entry of catalogs.entries) {
    const id = catalogId(entry.namespace, entry.key);
    const existing = catalogKeys.get(id) ?? [];
    existing.push(entry);
    catalogKeys.set(id, existing);
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

    const namespace = usage.message.namespace ?? options.defaultNamespace ?? "translation";
    const id = catalogId(namespace, usage.message.id);
    usedIds.add(id);
    if (!catalogKeys.has(id) && catalogs.validNamespaces.has(namespace)) {
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

  for (const [id, entries] of catalogKeys) {
    const locales = new Map(entries.map((entry) => [entry.locale, entry]));
    const first = entries[0]!;
    const allLocales = catalogs.localesByNamespace.get(first.namespace) ?? new Set<string>();
    for (const locale of allLocales) {
      if (!locales.has(locale)) {
        diagnostics.push(
          createDiagnostic({
            code: "missing-locale-key",
            rules: options.rules,
            message: `Translation key "${first.key}" is missing in locale "${locale}"`,
            filePath: first.filePath,
            catalogPath: first.filePath,
            line: 1,
            column: 1,
            key: first.key,
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

    if (!usedIds.has(id)) {
      diagnostics.push(
        createDiagnostic({
          code: "unused-translation-key",
          rules: options.rules,
          message: `Translation key "${first.key}" is never used`,
          filePath: first.filePath,
          catalogPath: first.filePath,
          line: 1,
          column: 1,
          key: first.key,
          locale: first.locale
        })
      );
    }
  }

  return diagnostics;
}

function catalogId(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}
