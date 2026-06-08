import {
  arrayOf,
  createDiagnostic,
  identifierName,
  literalValue,
  parseSource,
  stringLiteral
} from "@stale-i18n/core";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { AnyNode, CatalogEntry, CatalogReadResult, I18nextCheckOptions } from "./types.js";

export function readCatalogs(options: I18nextCheckOptions): CatalogReadResult {
  const patterns = Array.isArray(options.catalogs) ? options.catalogs : [options.catalogs];
  const catalogPaths = patterns.flatMap((pattern) => expandCatalogPattern(pattern));
  const entries: CatalogEntry[] = [];
  const diagnostics = [];
  const validNamespaces = new Set<string>();
  const localesByNamespace = new Map<string, Set<string>>();

  for (const catalogPath of catalogPaths) {
    const meta = inferCatalogMeta(catalogPath, options.defaultNamespace ?? "translation");
    if (!existsSync(catalogPath)) {
      const diagnostic = createDiagnostic({
        code: "catalog-file-not-found",
        rules: options.rules,
        message: `Catalog file not found: ${catalogPath}`,
        filePath: catalogPath,
        catalogPath,
        line: 1,
        column: 1
      });
      if (diagnostic) diagnostics.push(diagnostic);
      continue;
    }

    try {
      const parsed = readCatalogFile(catalogPath);
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
          filePath: catalogPath,
          keySeparator: options.keySeparator
        })
      );
    } catch (error) {
      const diagnostic = createDiagnostic({
        code: "catalog-parse-error",
        rules: options.rules,
        message: error instanceof Error ? error.message : "Invalid JSON catalog",
        filePath: catalogPath,
        catalogPath,
        line: 1,
        column: 1
      });
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  return {
    entries,
    diagnostics,
    catalogsChecked: catalogPaths.length,
    validNamespaces,
    localesByNamespace
  };
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

function expandCatalogPattern(pattern: string): string[] {
  if (!pattern.includes("{locale}") && !pattern.includes("{namespace}")) {
    return [path.resolve(pattern)];
  }

  const absolutePattern = path.resolve(pattern);
  const firstPlaceholder = absolutePattern.search(/\{(?:locale|namespace)\}/);
  const root = firstPlaceholder === -1 ? path.dirname(absolutePattern) : fixedRoot(absolutePattern);
  if (!existsSync(root)) {
    return [absolutePattern.replace("{locale}", "*").replace("{namespace}", "*")];
  }

  const matcher = patternToRegExp(absolutePattern);
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const filePath = path.join(dir, entry);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        visit(filePath);
      } else if (matcher.test(filePath)) {
        files.push(filePath);
      }
    }
  };
  visit(root);
  return files.sort();
}

function fixedRoot(pattern: string): string {
  const parts = pattern.split(path.sep);
  const rootParts: string[] = [];
  for (const part of parts) {
    if (part.includes("{locale}") || part.includes("{namespace}")) {
      break;
    }
    rootParts.push(part);
  }
  return rootParts.length === 1 && rootParts[0] === "" ? path.sep : rootParts.join(path.sep);
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped.replace("\\{locale\\}", "[^\\\\/]+").replace("\\{namespace\\}", "[^\\\\/]+")}$`
  );
}

function inferCatalogMeta(
  filePath: string,
  defaultNamespace: string
): { locale?: string; namespace: string } {
  const parsed = path.parse(filePath);
  return {
    locale: path.basename(path.dirname(filePath)),
    namespace: parsed.name || defaultNamespace
  };
}

export function flattenCatalog(
  value: unknown,
  context: {
    namespace: string;
    locale?: string | undefined;
    filePath: string;
    keySeparator?: string | false | undefined;
  },
  prefix = ""
): CatalogEntry[] {
  if (
    context.keySeparator === false &&
    prefix === "" &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return Object.entries(value as Record<string, unknown>).map(([key, child]) => ({
      key,
      namespace: context.namespace,
      ...(context.locale === undefined ? {} : { locale: context.locale }),
      filePath: context.filePath,
      value: child
    }));
  }

  if (
    context.keySeparator !== false &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenCatalog(child, context, prefix === "" ? key : `${prefix}.${key}`)
    );
  }

  return [
    {
      key: prefix,
      namespace: context.namespace,
      ...(context.locale === undefined ? {} : { locale: context.locale }),
      filePath: context.filePath,
      value
    }
  ];
}
