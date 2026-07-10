# @stale-i18n/formatjs

FormatJS and React Intl checks for `stale-i18n`.

This package scans source files for explicit message ids, compares them with locale
catalogs, and reports stale or missing translations.

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

The package is ESM-only and requires Node.js 22.18.0 or newer.

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
- `catalogs`: one or more catalog patterns. JSON catalogs and static ESM modules
  (`.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`, `.mts`, and `.cts`) are supported.
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

Catalogs must resolve to flat objects. They can be JSON files:

```json
{
  "checkout.title": "Checkout",
  "checkout.submit": "Pay now"
}
```

or static ESM modules exporting one object:

```ts
export default {
  "checkout.title": "Checkout",
  "checkout.submit": "Pay now"
};
```

The module object must be statically resolvable; CommonJS catalogs and runtime
computed values are not supported.

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

- Catalogs must be flat objects; nested messages are not supported.
- Generated message ids are not inferred.
- ICU syntax and placeholder consistency are not validated yet.
- `defaultMessage` extraction is out of scope for this package.
