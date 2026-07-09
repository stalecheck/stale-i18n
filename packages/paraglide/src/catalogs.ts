import { createDiagnostic } from "@stale-i18n/core";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { CatalogEntry, CatalogReadResult, ParaglideCheckOptions } from "./types.js";

export function readCatalogs(options: ParaglideCheckOptions): CatalogReadResult {
  const patterns = Array.isArray(options.catalogs) ? options.catalogs : [options.catalogs];
  const catalogPaths = patterns.flatMap((pattern) => expandCatalogPattern(pattern));
  const entries: CatalogEntry[] = [];
  const diagnostics = [];
  const locales = new Set<string>();

  for (const catalogPath of catalogPaths) {
    const locale = inferLocale(catalogPath);
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
      const parsed = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
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

function expandCatalogPattern(pattern: string): string[] {
  if (!pattern.includes("{locale}")) {
    return [path.resolve(pattern)];
  }

  const absolutePattern = path.resolve(pattern);
  const root = fixedRoot(absolutePattern);
  if (!existsSync(root)) {
    return [absolutePattern.replace("{locale}", "*")];
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
    if (part.includes("{locale}")) {
      break;
    }
    rootParts.push(part);
  }
  return rootParts.length === 1 && rootParts[0] === "" ? path.sep : rootParts.join(path.sep);
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace("\\{locale\\}", "[^\\\\/]+")}$`);
}

function inferLocale(filePath: string): string {
  return path.parse(filePath).name;
}

function flattenCatalog(value: unknown, filePath: string, locale: string): CatalogEntry[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Paraglide catalog must be a flat object: ${filePath}`);
  }

  return Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => ({
    key,
    locale,
    filePath,
    value: entryValue
  }));
}
