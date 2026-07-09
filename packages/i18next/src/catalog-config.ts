import type { i18n } from "i18next";

export type CatalogConfigI18n =
  | {
      type: "path";
      namespace?: string;
      locale?: string;
      data: string;
    }
  | {
      type: "resource";
      namespace?: string;
      locale?: string;
      filePath?: string;
      data: unknown;
    };

export const CatalogConfigI18n = {
  fromI18nInstances(instances: i18n | i18n[]): CatalogConfigI18n[] {
    const list = Array.isArray(instances) ? instances : [instances];

    return list.flatMap((instance) => {
      const store = instance.store.data;
      if (!isRecord(store)) {
        return [];
      }

      return Object.entries(store).flatMap(([locale, namespaces]) => {
        if (!isRecord(namespaces)) {
          return [];
        }

        return Object.entries(namespaces).map(([namespace, data]) => ({
          type: "resource",
          data,
          locale,
          namespace,
          filePath: `i18next://${locale}/${namespace}`
        }));
      });
    });
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
