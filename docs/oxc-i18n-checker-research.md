# Research: Oxc-Based i18n Checking

Date: 2026-06-07

## Summary

Oxc is a strong foundation for a modern i18n checker for JavaScript and TypeScript.
It lets `stale-i18n` analyze real source structure instead of relying on regexes,
which improves accuracy for imports, aliases, JSX, local constants, static enums,
and shadowed variables.

The recommended architecture is a small agnostic core plus separate packages for
each i18n ecosystem. The core should provide shared contracts and utilities, while
library packages own their source patterns, catalog formats, and user-facing APIs.

## Why Not Regex

Regex-based translation checkers are simple, but they struggle with common code:

- aliases such as `const { t: translate } = useTranslation()`;
- local constants and static templates;
- namespace and key prefix rules;
- JSX components such as `<Trans />` or `<FormattedMessage />`;
- shadowed variables that only look like translation functions;
- dynamic expressions that should be reported conservatively.

An AST-based checker can understand enough of the program structure to reduce both
false positives and false negatives.

## Core Design

The core should be a toolkit, not an orchestrator. It should expose:

- diagnostic and result types;
- rule definitions and severity handling;
- source locations;
- source discovery;
- Oxc parsing wrappers;
- AST helpers;
- static string resolution;
- shared comparison helpers when duplication appears across packages.

It should not expose a generic `checkTranslations({ libraries })` API. Each library
package should export one concrete checker class.

## Package Model

Recommended public API shape:

```ts
import { I18nextChecker } from "@stale-i18n/i18next";

const checker = new I18nextChecker({
  target: "src",
  catalogs: "locales/{locale}/{namespace}.json"
});

const result = await checker.check();
```

This keeps each package natural for its ecosystem and avoids forcing users to model
projects as if they used several i18n libraries at once.

## CLI Model

The CLI should use subcommands rather than a `--library` option:

```sh
stale-i18n i18next src --catalog "locales/{locale}/{namespace}.json"
stale-i18n formatjs src --catalog "lang/{locale}.json"
```

Each subcommand instantiates the matching package class and returns consistent text
or JSON diagnostics.

## Initial Rules

Useful cross-library rules are:

- `missing-translation-key`;
- `missing-locale-key`;
- `unused-translation-key`;
- `empty-translation-value`;
- `unresolved-dynamic-key`;
- `raw-ui-text`;
- `source-parse-error`;
- `catalog-parse-error`;
- `catalog-file-not-found`.

Rules that require deeper library-specific semantics, such as ICU validation or
placeholder comparison, are better left for later.

## i18next Notes

i18next offers the strongest initial value because many projects use runtime keys
that TypeScript cannot fully protect.

Important patterns:

- `i18next.t("key")`;
- `import { t } from "i18next"`;
- `useTranslation()` bindings;
- namespace and key prefix resolution;
- `<Trans i18nKey="key" />`;
- fallback arrays;
- statically resolvable constants, templates, ternaries, and enums.

Catalogs should support nested JSON, flat JSON with `keySeparator: false`, TypeScript
or JavaScript static objects, and `{locale}` / `{namespace}` path placeholders.

## FormatJS Notes

FormatJS centers on message descriptors:

- `intl.formatMessage({ id: "key" })`;
- local descriptors with static ids;
- `<FormattedMessage id="key" />`.

The checker should start with explicit ids and flat JSON catalogs. Generated ids,
ICU validation, and official extraction outputs can be considered later.

## Raw UI Text

`raw-ui-text` is valuable because type-safe i18n libraries do not catch text that
never enters the translation system. It should remain opt-in because it can be noisy.

Initial detection should cover:

- JSX text nodes;
- common accessible string attributes such as `aria-label`;
- visible attributes such as `placeholder`, `title`, and `alt`.

## Risks

Dynamic keys can create false confidence. The checker should report them as
`unresolved-dynamic-key` unless it can enumerate the exact possible keys.

Macro-heavy libraries may generate ids or messages at build time. For those, reading
official extraction output is safer than cloning compiler behavior.

Raw UI text can be noisy. Keep it disabled by default and configurable through normal
rule levels.

## Recommendation

Build `stale-i18n` as an Oxc-based monorepo with:

1. a library-agnostic core;
2. stable i18next support through API and CLI;
3. package-specific support for other ecosystems as they mature;
4. no generic multi-library public API;
5. no regex compatibility options from older tools.
