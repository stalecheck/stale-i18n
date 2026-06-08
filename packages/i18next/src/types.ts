import type { BaseCheckOptions, Diagnostic } from "@stale-i18n/core";
export type { AnyNode } from "@stale-i18n/core";

export type RawTextOptions = {
  enabled?: boolean;
  minLength?: number;
  ignore?: Array<string | RegExp>;
  attributes?: string[];
  components?: Record<string, string[]>;
  ignoreFiles?: string[];
};

export type I18nextCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
  defaultNamespace?: string;
  keySeparator?: string | false;
  namespaceSeparator?: string | false;
  rawText?: RawTextOptions;
};

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
