# stale-i18n

Static i18n checks for JavaScript and TypeScript projects.

`stale-i18n` compares translation usage in source files with the messages defined in
your locale catalogs. It helps catch broken translations before they reach users or
quietly drift out of date.

## Why Use It

- Find translation keys used in code but missing from catalogs.
- Detect catalog keys that are no longer used.
- Keep locale files aligned across languages.
- Report empty translation values.
- Flag dynamic keys that cannot be checked safely.
- Optionally detect raw UI text in JSX/TSX for i18next projects.

The checker is AST-based, not regex-based, so it understands imports, local aliases,
static constants, simple enums, JSX usage, and shadowing more reliably.

## Packages

```sh
pnpm add -D @stale-i18n/cli
pnpm add -D @stale-i18n/i18next
pnpm add -D @stale-i18n/formatjs
```

Packages are ESM-only and require Node.js 22.12 or newer.

Package documentation:

- [`@stale-i18n/cli`](./packages/cli/README.md): command-line usage for CI and local checks.
- [`@stale-i18n/i18next`](./packages/i18next/README.md): i18next and react-i18next source and catalog checks.
- [`@stale-i18n/formatjs`](./packages/formatjs/README.md): FormatJS and React Intl source and catalog checks.
- [`@stale-i18n/paraglide`](./packages/paraglide/README.md): experimental Paraglide API.
- [`@stale-i18n/core`](./packages/core/README.md): internal shared infrastructure for this monorepo.

## CLI

The CLI currently supports i18next and FormatJS projects. Paraglide remains an
experimental API package and is not wired into the CLI yet.

```sh
pnpm stale-i18n i18next ./src --catalog ./locales/{locale}/{namespace}.json
pnpm stale-i18n formatjs ./src --catalog ./locales/{locale}.json
```

Use `--default-namespace` when code calls `t("key")` without an explicit namespace:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --default-namespace common
```

Return JSON for CI or custom reports:

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

Ignore generated or vendor source files:

```sh
pnpm stale-i18n formatjs ./src \
  --catalog ./locales/{locale}.json \
  --ignore-paths "generated/**" \
  --ignore-paths "**/*.test.ts"
```

`--ignore-paths` accepts Node.js glob patterns matched against source paths. Passing
it replaces the default ignored paths: `node_modules`, `dist`, and `coverage`.

Exit codes:

- `0`: no error diagnostics
- `1`: one or more error diagnostics
- `2`: invalid CLI arguments or configuration

## i18next API

```ts
import { I18nextChecker } from "@stale-i18n/i18next";

const checker = new I18nextChecker({
  target: ["src/**/*.ts", "src/**/*.tsx"],
  catalogs: "locales/{locale}/{namespace}.json",
  ignorePaths: ["generated/**", "**/*.test.ts"],
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

### Catalogs

Pass JSON catalog paths as a single pattern or as a list of patterns:

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

`target` accepts a path, a Node.js glob pattern, or an array mixing both.
`ignorePaths` uses the same glob syntax. If omitted, `node_modules`, `dist`, and
`coverage` are ignored by default; if provided, `ignorePaths` replaces those defaults.

For generated or custom catalogs, pass `CatalogConfigI18n` directly:

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

const catalogs = CatalogConfigI18n.fromI18nInstances(i18n);

const result = await new I18nextChecker({
  target: "src",
  catalogs
}).check();
```

### Raw UI Text

Raw UI text checks are opt-in and currently apply to JSX/TSX i18next projects.

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

Rule levels are `off`, `warning`, and `error`.

Exact behavior can vary by package because each i18n library has different source
patterns and catalog formats.

| Rule | Description | Default |
| --- | --- | --- |
| `missing-translation-key` | Source uses a key that is missing from catalogs. | `error` |
| `missing-locale-key` | Locales do not define the same keys. | `error` |
| `unused-translation-key` | A catalog key is never used in source. | `error` |
| `empty-translation-value` | A catalog value is empty, `null`, or `undefined`. | `error` |
| `unresolved-dynamic-key` | A key usage cannot be resolved statically. | `error` |
| `raw-ui-text` | Visible or accessible UI text is written directly. | `off` |
| `source-parse-error` | A source file cannot be parsed. | `error` |
| `catalog-parse-error` | A catalog file cannot be parsed. | `error` |
| `catalog-file-not-found` | A configured catalog file is missing. | `error` |

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
