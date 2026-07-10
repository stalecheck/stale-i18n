# @stale-i18n/formatjs

FormatJS and React Intl checks for `stale-i18n`.

This package scans source files for explicit message ids, compares them with flat
locale catalogs, and reports stale or missing translations.

## What It Catches

- Message ids used in source but missing from catalogs.
- Message ids present in one locale but missing from another.
- Catalog messages that are no longer used.
- Empty, `null`, or `undefined` catalog values.
- Dynamic message ids that cannot be resolved statically.

## Install

```sh
pnpm add -D @stale-i18n/formatjs
```

The package is ESM-only and requires Node.js 22.12 or newer.

## Basic Usage

```ts
import { FormatjsChecker } from "@stale-i18n/formatjs";

const result = await new FormatjsChecker({
  target: "src",
  catalogs: "locales/{locale}.json"
}).check();
```

## Options

```ts
type FormatjsCheckOptions = {
  target?: string | string[];
  ignorePaths?: string[];
  rules?: Partial<Record<RuleCode, "off" | "warning" | "error">>;
  catalogs: string | string[];
};
```

- `target`: source file, directory, Node.js glob, or array mixing them.
- `catalogs`: one or more flat JSON catalog patterns.
- `ignorePaths`: Node.js glob patterns for source paths to skip. When omitted,
  `node_modules`, `dist`, and `coverage` are ignored by default. When provided,
  this list replaces those defaults.
- `rules`: override rule levels.

## Catalogs

Catalog paths support the `{locale}` placeholder:

```ts
const result = await new FormatjsChecker({
  target: "src",
  catalogs: ["locales/{locale}.json", "packages/admin/locales/{locale}.json"]
}).check();
```

Catalogs are expected to be flat JSON objects:

```json
{
  "checkout.title": "Checkout",
  "checkout.submit": "Pay now"
}
```

## Source Patterns

The checker resolves explicit ids in common React Intl patterns:

```ts
const intl = useIntl();

intl.formatMessage({ id: "checkout.title" });
```

```tsx
<FormattedMessage id="checkout.submit" />
```

It also supports local descriptors and statically resolvable constants, templates,
ternaries, and string enums.

Dynamic ids that cannot be enumerated safely are reported as
`unresolved-dynamic-key`.

## Limits

- Catalogs must be flat JSON today.
- Generated message ids are not inferred.
- ICU syntax and placeholder consistency are not validated yet.
- `defaultMessage` extraction is out of scope for this package.
