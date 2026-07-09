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

  markNestedCatalogUsages(usedIds, catalogKeys, catalogs, options, diagnostics);

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

function markNestedCatalogUsages(
  usedIds: Set<string>,
  catalogKeys: Map<string, CatalogEntry[]>,
  catalogs: CatalogReadResult,
  options: I18nextCheckOptions,
  diagnostics: Array<Diagnostic | null>
) {
  const visited = new Set<string>();
  const missingNestedIds = new Set<string>();
  const queue = [...usedIds];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    const entries = catalogKeys.get(id) ?? [];
    for (const entry of entries) {
      for (const reference of nestedReferences(entry.value, entry.namespace, options)) {
        const referenceId = catalogId(reference.namespace, reference.key);
        if (!usedIds.has(referenceId)) {
          usedIds.add(referenceId);
          queue.push(referenceId);
        }

        if (
          !catalogKeys.has(referenceId) &&
          catalogs.validNamespaces.has(reference.namespace) &&
          !missingNestedIds.has(referenceId)
        ) {
          missingNestedIds.add(referenceId);
          diagnostics.push(
            createDiagnostic({
              code: "missing-translation-key",
              rules: options.rules,
              message: `Missing translation key "${reference.key}"`,
              filePath: entry.filePath,
              catalogPath: entry.filePath,
              line: 1,
              column: 1,
              key: reference.key,
              locale: entry.locale
            })
          );
        }
      }
    }
  }
}

function nestedReferences(
  value: unknown,
  namespace: string,
  options: I18nextCheckOptions
): Array<{ namespace: string; key: string }> {
  if (typeof value !== "string") {
    return [];
  }

  const references: Array<{ namespace: string; key: string }> = [];
  const pattern = /\$t\(\s*([^,)]+)(?:,[^)]*)?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const rawKey = match[1]?.trim().replace(/^["'`]|["'`]$/g, "");
    if (rawKey) {
      references.push(resolveNestedReference(rawKey, namespace, options));
    }
  }
  return references;
}

function resolveNestedReference(
  rawKey: string,
  namespace: string,
  options: I18nextCheckOptions
): { namespace: string; key: string } {
  const namespaceSeparator =
    options.namespaceSeparator === false ? false : (options.namespaceSeparator ?? ":");
  if (namespaceSeparator !== false && rawKey.includes(namespaceSeparator)) {
    const [nestedNamespace, ...rest] = rawKey.split(namespaceSeparator);
    return { namespace: nestedNamespace!, key: rest.join(namespaceSeparator) };
  }
  return { namespace, key: rawKey };
}
