import {
  createConfigurationDiagnostic,
  createDiagnostic,
  expandCatalogPattern
} from "@stale-i18n/core";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogEntry, CatalogReadResult, ParaglideCheckOptions } from "./types.js";

export function readCatalogs(options: ParaglideCheckOptions): CatalogReadResult {
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
  const catalogPaths = patterns.flatMap((pattern) => {
    const matches = expandCatalogPattern(pattern);
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
  });

  for (const catalog of catalogPaths) {
    const catalogPath = catalog.filePath;
    const locale = catalog.locale ?? path.parse(catalogPath).name;
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
