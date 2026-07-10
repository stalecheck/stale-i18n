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
import type { AnyNode, CatalogEntry, CatalogReadResult, FormatjsCheckOptions } from "./types.js";

export async function readCatalogs(options: FormatjsCheckOptions): Promise<CatalogReadResult> {
  const patterns = Array.isArray(options.catalogs) ? options.catalogs : [options.catalogs];
  const entries: CatalogEntry[] = [];
  const diagnostics = [];
  const locales = new Set<string>();
  if (patterns.length === 0) {
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
  const catalogPaths = (await Promise.all(patterns.map(expandCatalogPattern))).flatMap(
    (matches, index) => {
      const pattern = patterns[index]!;
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
      return matches;
    }
  );

  for (const catalog of catalogPaths) {
    const catalogPath = catalog.filePath;
    const locale = catalog.locale ?? path.parse(catalogPath).name;
    try {
      if (!(await stat(catalogPath)).isFile()) throw new Error("Catalog file not found");
    } catch {
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
      const parsed = await readCatalogFile(catalogPath);
      locales.add(locale);
      entries.push(...flattenCatalog(parsed, catalogPath, locale));
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

  return { entries, diagnostics, catalogsChecked: catalogPaths.length, locales };
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
      const init = declarator.init;
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

function flattenCatalog(value: unknown, filePath: string, locale: string): CatalogEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`FormatJS catalog must be a flat object: ${filePath}`);
  }

  return Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
    key,
    locale,
    filePath,
    value: entryValue
  }));
}
