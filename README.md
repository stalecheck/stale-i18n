# stale-i18n

Static checks for JavaScript and TypeScript translation keys.

`stale-i18n` scans source files and locale catalogs, then reports:

- translation keys used in code but missing from catalogs
- catalog keys that are not used
- locale files that do not share the same keys
- empty translation values
- dynamic keys that cannot be resolved safely
- optional raw UI text in JSX/TSX for i18next projects

## Packages

```sh
pnpm add -D @stale-i18n/cli
pnpm add -D @stale-i18n/i18next
pnpm add -D @stale-i18n/formatjs
```

The packages are ESM-only and require Node.js 22.12 or newer.

## CLI

The CLI currently supports i18next projects.

```sh
pnpm stale-i18n i18next ./src --catalog ./locales/{locale}/{namespace}.json
```

Use `--default-namespace` when source code calls `t("key")` without a namespace:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --default-namespace common
```

Return JSON for CI or custom reporting:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --format json
```

Override rule levels:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --rule unused-translation-key=warning \
  --rule raw-ui-text=off
```

Exit codes:

- `0`: no error diagnostics
- `1`: one or more error diagnostics
- `2`: invalid CLI arguments or configuration

## i18next API

```ts
import { I18nextChecker } from "@stale-i18n/i18next";

const checker = new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json",
  mode: "jsx",
  defaultNamespace: "common"
});

const result = await checker.check();

if (result.status === "FAIL") {
  for (const diagnostic of result.diagnostics) {
    console.error(
      `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code} ${diagnostic.message}`
    );
  }
  process.exitCode = 1;
}
```

Use `checkSync()` when the caller must stay synchronous:

```ts
const result = checker.checkSync();
```

### i18next Catalogs

JSON catalogs can be passed as a single pattern or a list of patterns.

```ts
new I18nextChecker({
  target: "src",
  catalogs: [
    "locales/{locale}/{namespace}.json",
    "packages/admin/locales/{locale}/{namespace}.json"
  ],
  defaultNamespace: "translation"
});
```

For generated or custom catalogs, pass `CatalogConfigI18n`:

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

You can also read catalogs from existing i18next instances:

```ts
import { CatalogConfigI18n, I18nextChecker } from "@stale-i18n/i18next";

const result = await new I18nextChecker({
  target: "src",
  catalogs: CatalogConfigI18n.fromI18nInstances(i18n)
}).check();
```

### Raw UI Text

Raw text checks are opt-in. The current application mode is `jsx` by default and is the only
supported mode for now.

```ts
const result = await new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json",
  mode: "jsx",
  rules: {
    "raw-ui-text": "warning"
  }
}).check();
```

## FormatJS API

```ts
import { FormatjsChecker } from "@stale-i18n/formatjs";

const result = await new FormatjsChecker({
  target: "src",
  catalogs: "locales/{locale}.json"
}).check();
```

Multiple catalogs are supported:

```ts
const result = await new FormatjsChecker({
  target: "src",
  catalogs: ["locales/{locale}.json", "packages/admin/locales/{locale}.json"]
}).check();
```

## Rules

```ts
const result = await new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json",
  mode: "jsx",
  rules: {
    "missing-translation-key": "error",
    "missing-locale-key": "error",
    "unused-translation-key": "error",
    "empty-translation-value": "error",
    "unresolved-dynamic-key": "warning",
    "raw-ui-text": "off"
  }
}).check();
```

Rule levels are `off`, `warning`, and `error`.

## Result Shape

```ts
type CheckResult = {
  status: "SUCCESS" | "FAIL";
  diagnostics: Diagnostic[];
  filesChecked: number;
  catalogsChecked: number;
};
```

```ts
type Diagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  filePath: string;
  line: number;
  column: number;
  key?: string;
  locale?: string;
  catalogPath?: string;
};
```

## Development

```sh
pnpm install
pnpm test
pnpm build
pnpm lint
pnpm format:check
```
