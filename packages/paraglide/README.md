# @stale-i18n/paraglide

WIP Paraglide integration for `stale-i18n`.

This package is experimental and intentionally not documented in the main project
README yet. Its API and supported patterns may change while the checker is being
validated.

## Goal

The package will compare Paraglide message function usage in application source with
the source message catalogs used by the project.

Planned checks:

- message functions used in source but missing from catalogs;
- catalog messages that are no longer used;
- locale files that do not share the same keys;
- empty translation values;
- dynamic message access that cannot be resolved statically.

## Intended API

```ts
import { ParaglideChecker } from "@stale-i18n/paraglide";

const result = await new ParaglideChecker({
  target: "src",
  catalogs: "messages/{locale}.json"
}).check();
```

## Options

```ts
type ParaglideCheckOptions = {
  target?: string;
  ignore?: string[];
  rules?: Partial<Record<RuleCode, "off" | "warning" | "error">>;
  catalogs: string | string[];
};
```

- `target`: source file or directory to scan.
- `catalogs`: one or more flat JSON catalog patterns.
- `ignore`: source files to skip.
- `rules`: override rule levels.

## Planned Source Patterns

```ts
import { m } from "./paraglide/messages.js";

m.greeting();
```

```ts
import { m as messages } from "./paraglide/messages.js";

messages.save();
```

Statically resolvable computed keys are expected to be supported. Dynamic keys that
cannot be resolved safely should produce `unresolved-dynamic-key` diagnostics.

## Current Limits

- Treat this package as WIP.
- Catalog support is limited to flat JSON patterns.
- Inlang project settings are not inferred.
- Generated Paraglide output is not analyzed as a catalog source.
- Function parameters and placeholder consistency are not validated.
