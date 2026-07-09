# Specification: stale-i18n

Date: 2026-06-07

## Purpose

`stale-i18n` is a static translation checker for JavaScript and TypeScript projects.
It uses Oxc for source analysis, compares source usage against locale catalogs, and
reports translation drift with stable diagnostics that are suitable for CI.

The project is a pnpm monorepo with:

- a small library-agnostic core;
- package-specific checkers for each i18n ecosystem;
- one CLI package with library-specific subcommands.

## Product Principles

- Prefer AST analysis over regex matching.
- Keep `@stale-i18n/core` agnostic of i18n libraries.
- Expose one concrete checker class per library package.
- Keep public APIs small, typed, and stable.
- Resolve only keys that can be enumerated safely.
- Report unresolved dynamic keys instead of guessing.
- Make rule severity configurable with `off`, `warning`, and `error`.
- Require tests for every functional behavior and regression.

## Out Of Scope

The initial product does not include:

- ESLint or Oxlint plugins;
- multi-library checks in a single run;
- a generic public API such as `checkTranslations({ libraries: [...] })`;
- regex compatibility options such as `ignoredKeys`, `customRegExpToFindKeys`, or
  `deepSearch`;
- ICU syntax validation;
- placeholder comparison between locales;
- duplicate key detection;
- default message validation.

## Technology

- TypeScript and ESM.
- Node.js 22.12 or newer.
- pnpm workspaces.
- tsup for ESM builds and type declarations.
- Vitest with V8 coverage.
- Oxc parser and resolver for JavaScript and TypeScript analysis.
- oxlint and oxfmt for code quality.

## Workspace

Current packages:

```text
packages/
  core/
  i18next/
  formatjs/
  cli/
```

Experimental or future packages may live in the workspace, but only packages with
documented support should appear in the main README.

Each package owns its `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/`, and
`tests/` folders.

Package rules:

- `src/index.ts` is the public entrypoint.
- Public packages must export explicit symbols, not `export *`.
- Cross-package imports must use package entrypoints such as `@stale-i18n/core`.
- Tests are split into `tests/unit/` for focused internals and `tests/uses/` for
  public API scenarios.
- End-to-end use cases should use real files on disk and an `expected.json`.
- File names use kebab-case.

## Core Responsibilities

`@stale-i18n/core` provides shared contracts and reusable static-analysis helpers.
It must not know about i18next, FormatJS, Paraglide, Lingui, Intlayer, or any other
specific library.

Core owns:

- result and diagnostic types;
- rule definitions and rule-level merging;
- source locations;
- source file discovery;
- Oxc parsing wrappers;
- AST walking and static string resolution helpers;
- result creation and diagnostic normalization.

Core must not:

- expose a generic translation checker function;
- register library adapters at runtime;
- force a common catalog format;
- define library-specific source patterns.

## Public Contract

```ts
export type CheckStatus = "SUCCESS" | "FAIL";
export type RuleLevel = "off" | "warning" | "error";

export type Diagnostic = {
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

export type CheckResult = {
  status: CheckStatus;
  diagnostics: Diagnostic[];
  filesChecked: number;
  catalogsChecked: number;
};

export interface TranslationChecker<TOptions extends BaseCheckOptions = BaseCheckOptions> {
  readonly name: string;
  readonly options: Readonly<TOptions>;

  check(options?: Partial<TOptions>): Promise<CheckResult>;
  checkSync(options?: Partial<TOptions>): CheckResult;
}
```

`CheckResult.status` is `FAIL` when at least one diagnostic has
`severity: "error"`. Warnings alone keep the status as `SUCCESS`.

## Rules

Supported rule codes:

- `missing-translation-key`: a key is used in source but missing from catalogs.
- `missing-locale-key`: a key exists in one locale but not another.
- `unused-translation-key`: a catalog key is not used by source.
- `empty-translation-value`: a catalog value is empty, `null`, or `undefined`.
- `unresolved-dynamic-key`: a key usage cannot be resolved statically.
- `raw-ui-text`: visible or accessible JSX text bypasses i18n.
- `source-parse-error`: a source file cannot be parsed.
- `catalog-parse-error`: a catalog cannot be parsed.
- `catalog-file-not-found`: a configured catalog file does not exist.

All rules support `off`, `warning`, and `error`. `raw-ui-text` defaults to `off`;
all other rules default to `error`.

## Source Usage Model

Source analysis returns resolved or unresolved usages.

```ts
export type SourceUsage =
  | {
      kind: "resolved";
      message: MessageId;
      filePath: string;
      location: SourceLocation;
      sourceKind:
        | "call"
        | "jsx-component"
        | "tagged-template"
        | "message-descriptor"
        | "generated-message-function"
        | "dictionary-access";
    }
  | {
      kind: "unresolved";
      raw?: string;
      reason: "dynamic-key" | "unsupported-pattern";
      filePath: string;
      location: SourceLocation;
      sourceKind:
        | "call"
        | "jsx-component"
        | "tagged-template"
        | "message-descriptor"
        | "generated-message-function"
        | "dictionary-access";
    };
```

If a source expression can produce a finite set of keys, emit one or more resolved
usages. If it cannot be resolved safely, emit an unresolved usage.

## i18next Package

Public class:

```ts
export class I18nextChecker implements TranslationChecker<I18nextCheckOptions>
```

Initial options:

```ts
export type I18nextCheckOptions = BaseCheckOptions & {
  catalogs: string | string[] | CatalogConfigI18n;
  mode?: "jsx";
  defaultNamespace?: string;
  keySeparator?: string | false;
  namespaceSeparator?: string | false;
};
```

Supported source patterns include:

- `i18next.t("key")`;
- named `t` imports from `i18next`;
- `useTranslation()` and local `t` bindings;
- namespace and `keyPrefix` from `useTranslation`;
- `t("ns:key")` and `t("key", { ns: "ns" })`;
- fallback arrays such as `t(["specific", "fallback"])`;
- simple local aliases;
- `<Trans i18nKey="key" />`;
- statically resolvable string constants, ternaries, templates, and string enums;
- unresolved dynamic expressions as diagnostics.

Catalog support:

- nested i18next JSON;
- flat JSON when `keySeparator: false`;
- TypeScript or JavaScript static object catalogs;
- path placeholders `{locale}` and `{namespace}`;
- catalogs read from existing i18next instances through `CatalogConfigI18n`.

`raw-ui-text` is opt-in and currently applies only to JSX/TSX i18next projects.

## FormatJS Package

Public class:

```ts
export class FormatjsChecker implements TranslationChecker<FormatjsCheckOptions>
```

Initial options:

```ts
export type FormatjsCheckOptions = BaseCheckOptions & {
  catalogs: string | string[];
};
```

Supported source patterns include:

- `useIntl().formatMessage({ id: "key" })`;
- local message descriptors with static `id`;
- `<FormattedMessage id="key" />`;
- statically resolvable constants, ternaries, templates, and string enums;
- unresolved dynamic ids as diagnostics.

Catalog support:

- flat JSON catalogs such as `{ "message.id": "Message" }`;
- path placeholder `{locale}`;
- multiple explicit catalog patterns.

## CLI

The CLI exposes library-specific subcommands. Current stable support is:

```sh
stale-i18n i18next <target>
```

Common options:

- `--catalog <pattern>`;
- `--ignore <pattern>`;
- `--mode jsx`;
- `--rule code=level`;
- `--format text|json`.

Exit codes:

- `0`: no error diagnostics;
- `1`: one or more error diagnostics;
- `2`: invalid arguments or configuration.

Unsupported compatibility options must remain rejected:

- `--library`;
- `--ignored-keys`;
- `--custom-regexp-to-find-keys`;
- `--deep-search`.

## Testing Requirements

New behavior must follow this loop:

1. Describe or update the expected behavior.
2. Add a failing test.
3. Implement the smallest change that makes it pass.
4. Run the relevant test suite.
5. Run typecheck, lint, and formatting checks when the change affects public or shared code.

Use-case tests must exercise public APIs and real fixture files. Unit tests may target
internal helpers when they are small and focused.

## Definition Of Done

A feature is complete only when:

- the behavior is documented;
- tests cover success and failure paths;
- rule-level behavior is covered where relevant;
- public APIs match this specification;
- no unsupported compatibility options are introduced;
- package tests pass.
