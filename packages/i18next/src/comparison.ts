import { createDiagnostic, type Diagnostic } from "@stale-i18n/core";
import {
  appendTranslationKeySuffix,
  displayTranslationKey,
  normalizeKeySeparator,
  parseTranslationKey,
  translationKeyHasSameParent,
  translationKeyId,
  translationKeyLeaf
} from "./key-path.js";
import type {
  CatalogEntry,
  CatalogReadResult,
  I18nextCheckOptions,
  I18nextSourceUsage,
  PluralUsage,
  TranslationKey
} from "./types.js";

export function compareUsages(
  usages: I18nextSourceUsage[],
  catalogs: CatalogReadResult,
  options: I18nextCheckOptions
): Array<Diagnostic | null> {
  const diagnostics: Array<Diagnostic | null> = [];
  const catalogKeys = new Map<string, CatalogEntry[]>();
  for (const entry of catalogs.entries) {
    const id = catalogId(entry.namespace, entry.keyPath);
    const existing = catalogKeys.get(id) ?? [];
    existing.push(entry);
    catalogKeys.set(id, existing);
  }

  const usedIds = new Set<string>();
  const pluralCatalogIds = new Set<string>();
  const checkedPluralLocales = new Set<string>();
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
    if (usage.plural) {
      const family = pluralFamily(usage.keyPath, usage.plural);
      const familyId = catalogId(namespace, family);
      const matchingEntries = catalogs.entries.filter(
        (entry) => entry.namespace === namespace && isPluralFamilyMember(entry.keyPath, family)
      );

      for (const entry of matchingEntries) {
        const id = catalogId(entry.namespace, entry.keyPath);
        usedIds.add(id);
        pluralCatalogIds.add(id);
      }

      if (matchingEntries.length === 0) {
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
      } else if (!checkedPluralLocales.has(familyId)) {
        checkedPluralLocales.add(familyId);
        const presentLocales = new Set(matchingEntries.map((entry) => entry.locale));
        const allLocales = catalogs.localesByNamespace.get(namespace) ?? new Set<string>();
        for (const locale of allLocales) {
          if (!presentLocales.has(locale)) {
            const first = matchingEntries[0]!;
            diagnostics.push(
              createDiagnostic({
                code: "missing-locale-key",
                rules: options.rules,
                message: `Translation key "${usage.message.id}" is missing in locale "${locale}"`,
                filePath: first.filePath,
                catalogPath: first.filePath,
                line: 1,
                column: 1,
                key: usage.message.id,
                locale
              })
            );
          }
        }
      }
      continue;
    }

    const id = catalogId(namespace, usage.keyPath);
    usedIds.add(id);
    if (!catalogKeys.has(id)) {
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
    const first = entries[0]!;
    const displayKey = first.key;
    if (!pluralCatalogIds.has(id)) {
      const locales = new Map(entries.map((entry) => [entry.locale, entry]));
      const allLocales = catalogs.localesByNamespace.get(first.namespace) ?? new Set<string>();
      for (const locale of allLocales) {
        if (!locales.has(locale)) {
          diagnostics.push(
            createDiagnostic({
              code: "missing-locale-key",
              rules: options.rules,
              message: `Translation key "${displayKey}" is missing in locale "${locale}"`,
              filePath: first.filePath,
              catalogPath: first.filePath,
              line: 1,
              column: 1,
              key: displayKey,
              locale
            })
          );
        }
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
          message: `Translation key "${displayKey}" is never used`,
          filePath: first.filePath,
          catalogPath: first.filePath,
          line: 1,
          column: 1,
          key: displayKey,
          locale: first.locale
        })
      );
    }
  }

  return diagnostics;
}

function catalogId(namespace: string, key: TranslationKey): string {
  return JSON.stringify([namespace, translationKeyId(key)]);
}

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

function pluralFamily(key: TranslationKey, plural: PluralUsage): TranslationKey {
  const context = plural.context === undefined ? "" : `_${plural.context}`;
  const ordinal = plural.ordinal ? "_ordinal" : "";
  return appendTranslationKeySuffix(key, `${context}${ordinal}`);
}

function isPluralFamilyMember(key: TranslationKey, family: TranslationKey): boolean {
  if (!translationKeyHasSameParent(key, family)) {
    return false;
  }
  const keyLeaf = translationKeyLeaf(key);
  const familyLeaf = translationKeyLeaf(family);
  if (keyLeaf === familyLeaf) {
    return true;
  }
  if (!keyLeaf.startsWith(`${familyLeaf}_`)) {
    return false;
  }
  return PLURAL_CATEGORIES.has(keyLeaf.slice(familyLeaf.length + 1));
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

        if (!catalogKeys.has(referenceId) && !missingNestedIds.has(referenceId)) {
          missingNestedIds.add(referenceId);
          const referenceKey = displayTranslationKey(
            reference.key,
            normalizeKeySeparator(options.keySeparator)
          );
          diagnostics.push(
            createDiagnostic({
              code: "missing-translation-key",
              rules: options.rules,
              message: `Missing translation key "${referenceKey}"`,
              filePath: entry.filePath,
              catalogPath: entry.filePath,
              line: 1,
              column: 1,
              key: referenceKey,
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
): Array<{ namespace: string; key: TranslationKey }> {
  if (typeof value !== "string") {
    return [];
  }

  const references: Array<{ namespace: string; key: TranslationKey }> = [];
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
): { namespace: string; key: TranslationKey } {
  const namespaceSeparator =
    options.namespaceSeparator === false ? false : (options.namespaceSeparator ?? ":");
  const keySeparator = normalizeKeySeparator(options.keySeparator);
  if (namespaceSeparator !== false && rawKey.includes(namespaceSeparator)) {
    const [nestedNamespace, ...rest] = rawKey.split(namespaceSeparator);
    return {
      namespace: nestedNamespace!,
      key: parseTranslationKey(rest.join(namespaceSeparator), keySeparator)
    };
  }
  return { namespace, key: parseTranslationKey(rawKey, keySeparator) };
}
