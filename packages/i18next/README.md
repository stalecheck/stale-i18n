# @stale-i18n/i18next

i18next and react-i18next checks for `stale-i18n`.

This package scans JavaScript, TypeScript, JSX, and TSX source files, resolves i18next
translation key usage where it can do so safely, and compares those usages with your
locale catalogs.

## What It Catches

- Keys used in source but missing from catalogs.
- Keys present in one locale but missing from another.
- Catalog keys that are no longer used.
- Empty, `null`, or `undefined` translation values.
- Dynamic key usage that cannot be resolved statically.
- Optional raw UI text in JSX/TSX.

## Install

```sh
pnpm add -D @stale-i18n/i18next
```

The package is ESM-only and requires Node.js 22.12 or newer.

## Basic Usage

```ts
import { I18nextChecker } from "@stale-i18n/i18next";

const result = await new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json",
  defaultNamespace: "translation"
}).check();
```

Use `checkSync()` for synchronous integrations:

```ts
const result = new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json"
}).checkSync();
```

## Options

```ts
type I18nextCheckOptions = {
  target?: string | string[];
  ignorePaths?: string[];
  rules?: Partial<Record<RuleCode, "off" | "warning" | "error">>;
  catalogs: string | string[] | CatalogConfigI18n | CatalogConfigI18n[];
  mode?: "jsx";
  defaultNamespace?: string;
  keySeparator?: string | false;
  namespaceSeparator?: string | false;
};
```

- `target`: source file, directory, Node.js glob, or array mixing them. Defaults to
  the current working area used by the checker.
- `ignorePaths`: Node.js glob patterns for source paths to skip, for example
  `["generated/**", "**/*.test.ts"]`. When omitted, `node_modules`, `dist`, and
  `coverage` are ignored by default. When provided, this list replaces those defaults.
- `catalogs`: catalog paths, resource objects, or both.
- `mode`: currently `jsx`.
- `defaultNamespace`: namespace used for unqualified `t("key")` calls.
- `keySeparator`: set to `false` for flat JSON keys.
- `namespaceSeparator`: customize or disable namespace syntax in keys.
- `rules`: override rule levels.

## Catalogs

Path catalogs support `{locale}` and `{namespace}` placeholders:

```ts
new I18nextChecker({
  target: "src",
  catalogs: [
    "locales/{locale}/{namespace}.json",
    "packages/admin/locales/{locale}/{namespace}.json"
  ],
  defaultNamespace: "common"
});
```

Catalogs may also come from existing i18next instances:

```ts
import { I18nextChecker, type CatalogConfigI18n } from "@stale-i18n/i18next";

const catalogs: CatalogConfigI18n = {
  type: "resource",
  locale: "en",
  namespace: "common",
  filePath: "locales/en/common.json",
  data: {
    "checkout.title": "Checkout"
  }
};

const result = await new I18nextChecker({
  target: "src",
  catalogs
}).check();
```

You can also build catalog config from live i18next instances:

```ts
import { CatalogConfigI18n, I18nextChecker } from "@stale-i18n/i18next";

const result = await new I18nextChecker({
  target: "src",
  catalogs: CatalogConfigI18n.fromI18nInstances(i18n)
}).check();
```

Supported catalog shapes include nested i18next JSON, flat JSON with
`keySeparator: false`, and static TypeScript or JavaScript object exports.

## Source Patterns

The checker handles common i18next and react-i18next usage:

```ts
i18next.t("checkout.title");
t("checkout.title");
```

```tsx
const { t } = useTranslation("checkout");

return <button>{t("submit")}</button>;
```

```tsx
<Trans i18nKey="checkout.submit" />
```

It also supports simple aliases, fallback arrays, namespace options, key prefixes,
and statically resolvable constants, templates, ternaries, and string enums.

Calls with `count`, including `<Trans>` and `tOptions`, are checked as plural
families. Existing cardinal or ordinal variants for that family are considered
used in each locale, including context variants. The checker requires the family
to exist in every locale, but does not require every plural category to be present.

Dynamic expressions that cannot be enumerated safely are reported as
`unresolved-dynamic-key`.

## Raw UI Text

Raw UI text is disabled by default. Enable it when you want to catch visible or
accessible JSX text that bypasses i18n:

```ts
const result = await new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json",
  rules: {
    "raw-ui-text": "warning"
  }
}).check();
```

## Limits

- `mode` is currently limited to `jsx`.
- Dynamic namespaces and dynamic keys are not guessed.
- ICU syntax and placeholder consistency are not validated yet.
- Multi-library checks belong in separate package runs, not in this checker.
