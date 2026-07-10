import {
  arrayOf,
  createDiagnostic,
  expandCatalogPattern,
  identifierName,
  literalValue,
  parseSource,
  stringLiteral
} from "@stale-i18n/core";
import { existsSync, readFileSync } from "node:fs";
import type { CatalogConfigI18n } from "./catalog-config.js";
import {
  displayTranslationKey,
  normalizeKeySeparator,
  parseTranslationKey,
  translationKeyFromSegments,
  type KeySeparator
} from "./key-path.js";
import type {
  AnyNode,
  CatalogEntry,
  CatalogReadResult,
  I18nextCatalogInput,
  I18nextCheckOptions
} from "./types.js";

export function readCatalogs(options: I18nextCheckOptions): CatalogReadResult {
  const catalogs = Array.isArray(options.catalogs) ? options.catalogs : [options.catalogs];
  const pathConfigs = catalogs.filter(isPathCatalog);
  const resourceConfigs = catalogs.filter(isResourceCatalog);
  const catalogPaths = pathConfigs.flatMap((catalog) =>
    expandCatalogPattern(pathCatalogData(catalog)).map((expanded) => ({
      ...expanded,
      configuredLocale: typeof catalog === "string" ? undefined : catalog.locale,
      configuredNamespace: typeof catalog === "string" ? undefined : catalog.namespace
    }))
  );
  const entries: CatalogEntry[] = [];
  const diagnostics = [];
  const validNamespaces = new Set<string>();
  const localesByNamespace = new Map<string, Set<string>>();

  for (const catalog of catalogPaths) {
    const meta = {
      locale: catalog.configuredLocale ?? catalog.locale,
      namespace:
        catalog.configuredNamespace ??
        catalog.namespace ??
        options.defaultNamespace ??
        "translation"
    };
    if (!existsSync(catalog.filePath)) {
      const diagnostic = createDiagnostic({
        code: "catalog-file-not-found",
        rules: options.rules,
        message: `Catalog file not found: ${catalog.filePath}`,
        filePath: catalog.filePath,
        catalogPath: catalog.filePath,
        line: 1,
        column: 1
      });
      if (diagnostic) diagnostics.push(diagnostic);
      continue;
    }

    try {
      const parsed = readCatalogFile(catalog.filePath);
      validNamespaces.add(meta.namespace);
      if (meta.locale) {
        const locales = localesByNamespace.get(meta.namespace) ?? new Set<string>();
        locales.add(meta.locale);
        localesByNamespace.set(meta.namespace, locales);
      }
      entries.push(
        ...flattenCatalog(parsed, {
          namespace: meta.namespace,
          locale: meta.locale,
          filePath: catalog.filePath,
          keySeparator: options.keySeparator
        })
      );
    } catch (error) {
      const diagnostic = createDiagnostic({
        code: "catalog-parse-error",
        rules: options.rules,
        message: error instanceof Error ? error.message : "Invalid JSON catalog",
        filePath: catalog.filePath,
        catalogPath: catalog.filePath,
        line: 1,
        column: 1
      });
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  for (const config of resourceConfigs) {
    const namespace = config.namespace ?? options.defaultNamespace ?? "translation";
    validNamespaces.add(namespace);
    if (config.locale) {
      const locales = localesByNamespace.get(namespace) ?? new Set<string>();
      locales.add(config.locale);
      localesByNamespace.set(namespace, locales);
    }

    entries.push(
      ...flattenCatalog(config.data, {
        namespace,
        locale: config.locale,
        filePath: config.filePath ?? virtualCatalogPath(namespace, config.locale),
        keySeparator: options.keySeparator
      })
    );
  }

  return {
    entries,
    diagnostics,
    catalogsChecked: catalogPaths.length + resourceConfigs.length,
    validNamespaces,
    localesByNamespace
  };
}

function isPathCatalog(
  catalog: I18nextCatalogInput
): catalog is string | Extract<CatalogConfigI18n, { type: "path" }> {
  return typeof catalog === "string" || catalog.type === "path";
}

function isResourceCatalog(
  catalog: I18nextCatalogInput
): catalog is Extract<CatalogConfigI18n, { type: "resource" }> {
  return typeof catalog !== "string" && catalog.type === "resource";
}

function pathCatalogData(catalog: string | Extract<CatalogConfigI18n, { type: "path" }>): string {
  return typeof catalog === "string" ? catalog : catalog.data;
}

function virtualCatalogPath(namespace: string, locale: string | undefined): string {
  return `i18next://${locale ?? "unknown"}/${namespace}`;
}

function readCatalogFile(filePath: string): unknown {
  const source = readFileSync(filePath, "utf8");
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) {
    return readStaticModuleCatalog(filePath, source);
  }
  return JSON.parse(source) as unknown;
}

function readStaticModuleCatalog(filePath: string, source: string): unknown {
  const parsed = parseSource(filePath, source);
  if (parsed.program === null) {
    throw new Error(parsed.diagnostics[0]?.message ?? "Catalog module could not be parsed");
  }
  const program = parsed.program as AnyNode;
  for (const statement of arrayOf<AnyNode>(program.body)) {
    if (statement.type === "ExportDefaultDeclaration") {
      return evaluateStaticValue(unwrapExpression(statement.declaration as AnyNode), filePath);
    }
    if (statement.type === "ExportNamedDeclaration") {
      const declaration = statement.declaration as AnyNode | undefined;
      if (declaration?.type === "VariableDeclaration") {
        const candidates = arrayOf<AnyNode>(declaration.declarations)
          .map((declarator) => declarator.init as AnyNode | undefined)
          .filter((init): init is AnyNode => Boolean(init));
        if (candidates.length === 1) {
          return evaluateStaticValue(unwrapExpression(candidates[0]), filePath);
        }
      }
    }
  }
  throw new Error(`Catalog module must export one static object: ${filePath}`);
}

function evaluateStaticValue(node: AnyNode | undefined, filePath: string): unknown {
  const expression = unwrapExpression(node);
  if (!expression) {
    throw new Error(`Catalog module contains an unsupported value in ${filePath}`);
  }
  if (expression.type === "ObjectExpression") {
    const result: Record<string, unknown> = {};
    for (const property of arrayOf<AnyNode>(expression.properties)) {
      if (property.type !== "Property" || property.computed === true) {
        throw new Error(`Catalog module contains an unsupported object property in ${filePath}`);
      }
      const key = propertyKey(property.key as AnyNode | undefined);
      if (!key) {
        throw new Error(`Catalog module contains an unsupported object key in ${filePath}`);
      }
      result[key] = evaluateStaticValue(property.value as AnyNode | undefined, filePath);
    }
    return result;
  }
  if (expression.type === "ArrayExpression") {
    return arrayOf<AnyNode>(expression.elements).map((element) =>
      evaluateStaticValue(element, filePath)
    );
  }
  if (expression.type === "Literal" || expression.type === "StringLiteral") {
    return literalValue(expression);
  }
  throw new Error(`Catalog module contains a dynamic value in ${filePath}`);
}

function unwrapExpression(node: AnyNode | undefined): AnyNode | undefined {
  let current = node;
  while (
    current?.type === "TSAsExpression" ||
    current?.type === "TSSatisfiesExpression" ||
    current?.type === "TSNonNullExpression"
  ) {
    current = current.expression as AnyNode | undefined;
  }
  return current;
}

function propertyKey(node: AnyNode | undefined): string | undefined {
  return identifierName(node) ?? stringLiteral(node);
}

export function flattenCatalog(
  value: unknown,
  context: {
    namespace: string;
    locale?: string | undefined;
    filePath: string;
    keySeparator?: string | false | undefined;
  }
): CatalogEntry[] {
  return flattenCatalogValue(value, context, normalizeKeySeparator(context.keySeparator), []);
}

function flattenCatalogValue(
  value: unknown,
  context: {
    namespace: string;
    locale?: string | undefined;
    filePath: string;
  },
  keySeparator: KeySeparator,
  segments: string[]
): CatalogEntry[] {
  if (
    keySeparator === false &&
    segments.length === 0 &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      const keyPath = parseTranslationKey(key, keySeparator);
      return {
        key,
        keyPath,
        namespace: context.namespace,
        ...(context.locale === undefined ? {} : { locale: context.locale }),
        filePath: context.filePath,
        value: child
      };
    });
  }

  if (
    keySeparator !== false &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenCatalogValue(child, context, keySeparator, [...segments, ...key.split(keySeparator)])
    );
  }

  const keyPath =
    keySeparator === false
      ? parseTranslationKey("", keySeparator)
      : translationKeyFromSegments(segments);
  return [
    {
      key: displayTranslationKey(keyPath, keySeparator),
      keyPath,
      namespace: context.namespace,
      ...(context.locale === undefined ? {} : { locale: context.locale }),
      filePath: context.filePath,
      value
    }
  ];
}
