# @stale-i18n/cli

Command-line interface for `stale-i18n`.

Use this package in CI or local scripts when you want translation checks without
writing Node.js integration code.

## Install

```sh
pnpm add -D @stale-i18n/cli
```

The package provides the `stale-i18n` executable and requires Node.js 22.12 or newer.

## Supported Commands

The CLI currently supports i18next projects:

```sh
stale-i18n i18next <target>
```

Other library packages may expose programmatic APIs before they are wired into the
CLI.

## i18next Usage

```sh
pnpm stale-i18n i18next ./src --catalog ./locales/{locale}/{namespace}.json
```

Set the default namespace for unqualified `t("key")` calls:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --default-namespace common
```

Use JSON output for CI systems and custom reporters:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --format json
```

Override rule levels from the command line:

```sh
pnpm stale-i18n i18next ./src \
  --catalog ./locales/{locale}/{namespace}.json \
  --rule unused-translation-key=warning \
  --rule raw-ui-text=off
```

## Options

- `--catalog <pattern>`: required. Can be passed more than once.
- `--default-namespace <name>`: namespace for unqualified i18next keys.
- `--mode jsx`: source mode. `jsx` is currently the only accepted value.
- `--rule <code=level>`: override a rule with `off`, `warning`, or `error`.
- `--format text|json`: output format. Defaults to `text`.

## Exit Codes

- `0`: the check completed with no error diagnostics.
- `1`: the check completed and found one or more error diagnostics.
- `2`: CLI arguments or configuration were invalid.

## Unsupported Options

The CLI intentionally rejects compatibility flags from older regex-based tools:

- `--library`
- `--ignored-keys`
- `--custom-regexp-to-find-keys`
- `--deep-search`

`stale-i18n` relies on library-specific AST analysis instead of regex customization.
