import {
  arrayOf,
  createConfigurationDiagnostic,
  createDiagnostic,
  expandCatalogPattern,
  identifierName,
  literalValue,
  parseSource,
  stringLiteral
} from "@stale-i18n/core";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
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

export async function readCatalogs(options: I18nextCheckOptions): Promise<CatalogReadResult> {
  const catalogs = Array.isArray(options.catalogs) ? options.catalogs : [options.catalogs];
  const diagnostics = [];
  if (catalogs.length === 0) {
    diagnostics.push(
      createConfigurationDiagnostic({
        code: "catalog-target-not-found",
        message: "No catalog targets were configured.",
        filePath: process.cwd(),
        line: 1,
        column: 1
      })
    );
  }
  const pathConfigs = catalogs.filter(isPathCatalog);
  const resourceConfigs = catalogs.filter(isResourceCatalog);
  const catalogPaths = (
    await Promise.all(pathConfigs.map((catalog) => expandCatalogPattern(pathCatalogData(catalog))))
  ).flatMap((matches, index) => {
    const catalog = pathConfigs[index]!;
    const pattern = pathCatalogData(catalog);
    if (matches.length === 0) {
      diagnostics.push(
        createConfigurationDiagnostic({
          code: "catalog-target-not-found",
          message: `Catalog target was not found: ${pattern}`,
          filePath: path.resolve(pattern),
          line: 1,
          column: 1
        })
      );
    }
    return matches.map((expanded) => ({
      ...expanded,
      configuredLocale: typeof catalog === "string" ? undefined : catalog.locale,
      configuredNamespace: typeof catalog === "string" ? undefined : catalog.namespace
    }));
  });
  const entries: CatalogEntry[] = [];
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
    try {
      if (!(await stat(catalog.filePath)).isFile()) throw new Error("Catalog file not found");
    } catch {
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
      const parsed = await readCatalogFile(catalog.filePath);
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

async function readCatalogFile(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  if (/\.cjs$/.test(filePath)) {
    throw new Error(`CommonJS catalogs are not supported: ${filePath}`);
  }
  if (/\.(?:ts|tsx|js|jsx|mjs|mts|cts)$/.test(filePath)) {
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
  const bindings = staticModuleBindings(program);
  let namedExport: AnyNode | undefined;
  for (const statement of arrayOf<AnyNode>(program.body)) {
    if (statement.type === "ExportDefaultDeclaration") {
      return evaluateStaticValue(statement.declaration as AnyNode, filePath, bindings);
    }
    if (statement.type === "ExportNamedDeclaration") {
      const candidate = namedStaticExport(statement, bindings);
      if (!candidate) continue;
      if (namedExport) throw new Error(`Catalog module has multiple named exports: ${filePath}`);
      namedExport = candidate;
    }
  }
  if (namedExport) return evaluateStaticValue(namedExport, filePath, bindings);
  throw new Error(`Catalog module must export one static object: ${filePath}`);
}

function staticModuleBindings(program: AnyNode): Map<string, AnyNode> {
  const bindings = new Map<string, AnyNode>();
  for (const statement of arrayOf<AnyNode>(program.body)) {
    if (statement.type !== "VariableDeclaration" || statement.kind !== "const") continue;
    for (const declarator of arrayOf<AnyNode>(statement.declarations)) {
      const name = identifierName(declarator.id);
      const init = declarator.init as AnyNode | undefined;
      if (name && init) bindings.set(name, init);
    }
  }
  return bindings;
}

function namedStaticExport(
  statement: AnyNode,
  bindings: Map<string, AnyNode>
): AnyNode | undefined {
  const declaration = statement.declaration as AnyNode | undefined;
  if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") {
    const declarators = arrayOf<AnyNode>(declaration.declarations);
    if (declarators.length !== 1) return undefined;
    return declarators[0]?.init as AnyNode | undefined;
  }
  const specifiers = arrayOf<AnyNode>(statement.specifiers);
  if (specifiers.length !== 1) return undefined;
  const local = identifierName(specifiers[0]?.local);
  return local ? bindings.get(local) : undefined;
}

function evaluateStaticValue(
  node: AnyNode | undefined,
  filePath: string,
  bindings: Map<string, AnyNode>,
  resolving = new Set<string>(),
  allowBinding = true
): unknown {
  const expression = unwrapExpression(node);
  if (!expression) {
    throw new Error(`Catalog module contains an unsupported value in ${filePath}`);
  }
  const name = identifierName(expression);
  if (name) {
    if (!allowBinding) throw new Error(`Catalog module contains a dynamic value in ${filePath}`);
    if (resolving.has(name)) {
      throw new Error(`Catalog module contains a circular binding in ${filePath}`);
    }
    const binding = bindings.get(name);
    if (!binding) throw new Error(`Catalog module contains a dynamic value in ${filePath}`);
    resolving.add(name);
    const value = evaluateStaticValue(binding, filePath, bindings, resolving, true);
    resolving.delete(name);
    return value;
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
      result[key] = evaluateStaticValue(
        property.value as AnyNode | undefined,
        filePath,
        bindings,
        resolving,
        false
      );
    }
    return result;
  }
  if (expression.type === "ArrayExpression") {
    return arrayOf<AnyNode>(expression.elements).map((element) =>
      evaluateStaticValue(element, filePath, bindings, resolving, false)
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
