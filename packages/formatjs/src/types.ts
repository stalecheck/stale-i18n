import type { BaseCheckOptions, Diagnostic } from "@stale-i18n/core";
export type { AnyNode } from "@stale-i18n/core";

export type FormatjsCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
};

export type CatalogEntry = {
  key: string;
  locale?: string;
  filePath: string;
  value: unknown;
};

export type CatalogReadResult = {
  entries: CatalogEntry[];
  diagnostics: Diagnostic[];
  catalogsChecked: number;
  locales: Set<string>;
};
