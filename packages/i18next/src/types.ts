import type { BaseCheckOptions, Diagnostic } from "@stale-i18n/core";
import type { CatalogConfigI18n } from "./catalog-config.js";
export type { AnyNode } from "@stale-i18n/core";
export type { CatalogConfigI18n } from "./catalog-config.js";

export type I18nextCheckMode = "jsx";

export type I18nextCheckOptions = BaseCheckOptions & {
  catalogs: I18nextCatalogs;
  mode?: I18nextCheckMode;
  defaultNamespace?: string;
  keySeparator?: string | false;
  namespaceSeparator?: string | false;
};

export type I18nextCatalogInput = string | CatalogConfigI18n;

export type I18nextCatalogs = I18nextCatalogInput | I18nextCatalogInput[];

export type TBinding = {
  namespace: string;
  keyPrefix?: string;
};

export type CatalogEntry = {
  key: string;
  namespace: string;
  locale?: string;
  filePath: string;
  value: unknown;
};

export type CatalogReadResult = {
  entries: CatalogEntry[];
  diagnostics: Diagnostic[];
  catalogsChecked: number;
  validNamespaces: Set<string>;
  localesByNamespace: Map<string, Set<string>>;
};
