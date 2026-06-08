import type { BaseCheckOptions, Diagnostic } from "@stale-i18n/core";

export type FormatjsCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
};

export type AnyNode = Record<string, unknown> & {
  type?: string;
  start?: number;
  end?: number;
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
