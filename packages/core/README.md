# @stale-i18n/core

Internal shared infrastructure for the `stale-i18n` monorepo.

Its exports support the CLI and library-specific packages in this repository, and
they may change as those packages evolve.

## What It Provides

`@stale-i18n/core` keeps shared behavior out of library packages without becoming a
generic i18n checker.

It provides:

- common result, diagnostic, rule, and source usage types;
- rule definitions and rule-level merging;
- diagnostic and result creation helpers;
- source file discovery;
- Oxc-based JavaScript and TypeScript parsing;
- AST walking helpers;
- source location helpers;
- conservative static string resolution.

## What It Does Not Provide

The core package does not:

- expose a user-facing `checkTranslations` API;
- know about i18next, FormatJS, Paraglide, Lingui, or Intlayer;
- select libraries at runtime;
- read library-specific catalog formats by itself;
- define library-specific source patterns.

That work belongs in packages such as `@stale-i18n/i18next` and
`@stale-i18n/formatjs`.

## Main Internal Concepts

`CheckResult` is the normalized output shape used by every checker:

```ts
type CheckResult = {
  status: "SUCCESS" | "FAIL";
  diagnostics: Diagnostic[];
  filesChecked: number;
  catalogsChecked: number;
};
```

`Diagnostic` carries rule code, severity, location, and optional key/catalog metadata:

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

`SourceUsage` is the bridge between source analyzers and catalog comparison. A usage is
either resolved to concrete message ids or marked unresolved when the key depends on
runtime data.

## Development Notes

Keep this package library-agnostic. If a helper only makes sense for one ecosystem,
leave it in that package until a second package needs the same behavior.
