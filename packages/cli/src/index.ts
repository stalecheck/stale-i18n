import { I18nextChecker, type I18nextCheckOptions } from "@stale-i18n/i18next";
import {
  RULE_DEFINITIONS,
  type CheckResult,
  type Diagnostic,
  type RuleCode,
  type RuleLevel,
  type RuleOverrides
} from "@stale-i18n/core";

export type CliRunResult = {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
};

type CliFormat = "text" | "json";

const PROHIBITED_OPTIONS = new Set([
  "--library",
  "--ignored-keys",
  "--custom-regexp-to-find-keys",
  "--deep-search"
]);

export async function runCli(argv: string[]): Promise<CliRunResult> {
  try {
    const parsed = parseArgs(argv);
    if (parsed.command !== "i18next") {
      return invalid(`Unsupported command "${parsed.command ?? ""}"`);
    }

    const options: I18nextCheckOptions = {
      target: parsed.target,
      catalogs: parsed.catalogs,
      ...(parsed.defaultNamespace === undefined
        ? {}
        : { defaultNamespace: parsed.defaultNamespace }),
      ...(Object.keys(parsed.rules).length === 0 ? {} : { rules: parsed.rules })
    };
    const checker = new I18nextChecker(options);
    const result = await checker.check();
    return {
      exitCode: result.status === "FAIL" ? 1 : 0,
      stdout:
        parsed.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : formatText(result),
      stderr: ""
    };
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid arguments");
  }
}

function parseArgs(argv: string[]): {
  command?: string;
  target: string;
  catalogs: string[];
  defaultNamespace?: string | undefined;
  rules: RuleOverrides;
  format: CliFormat;
} {
  for (const arg of argv) {
    if (PROHIBITED_OPTIONS.has(arg)) {
      throw new Error(`Option ${arg} is not supported`);
    }
  }

  const [command, target, ...rest] = argv;
  if (!command || !target) {
    throw new Error("Expected a subcommand and target");
  }

  const catalogs: string[] = [];
  const rules: RuleOverrides = {};
  let defaultNamespace: string | undefined;
  let format: CliFormat = "text";

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--catalog") {
      const value = rest[index + 1];
      if (!value) throw new Error("--catalog requires a value");
      catalogs.push(value);
      index += 1;
      continue;
    }
    if (arg === "--default-namespace") {
      const value = rest[index + 1];
      if (!value) throw new Error("--default-namespace requires a value");
      defaultNamespace = value;
      index += 1;
      continue;
    }
    if (arg === "--rule") {
      const value = rest[index + 1];
      if (!value) throw new Error("--rule requires a value");
      const [code, level] = value.split("=");
      if (!isRuleCode(code) || !isRuleLevel(level)) throw new Error(`Invalid rule "${value}"`);
      rules[code] = level;
      index += 1;
      continue;
    }
    if (arg === "--format") {
      const value = rest[index + 1];
      if (value !== "text" && value !== "json") throw new Error("--format must be text or json");
      format = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--")) {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  if (catalogs.length === 0) {
    throw new Error("--catalog is required");
  }

  return { command, target, catalogs, defaultNamespace, rules, format };
}

function isRuleCode(value: string | undefined): value is RuleCode {
  return Boolean(value && value in RULE_DEFINITIONS);
}

function isRuleLevel(value: string | undefined): value is RuleLevel {
  return value === "off" || value === "warning" || value === "error";
}

function invalid(message: string): CliRunResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: `${message}\n`
  };
}

function formatText(result: CheckResult): string {
  const byFile = new Map<string, Diagnostic[]>();
  for (const diagnostic of result.diagnostics) {
    const diagnostics = byFile.get(diagnostic.filePath) ?? [];
    diagnostics.push(diagnostic);
    byFile.set(diagnostic.filePath, diagnostics);
  }

  const lines: string[] = [];
  for (const [filePath, diagnostics] of byFile) {
    lines.push(filePath);
    for (const diagnostic of diagnostics) {
      lines.push(
        `  ${diagnostic.line}:${diagnostic.column}  ${diagnostic.severity}  ${diagnostic.message}  ${diagnostic.code}`
      );
    }
    lines.push("");
  }

  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  ).length;
  lines.push(
    `Checked ${result.filesChecked} source files and ${result.catalogsChecked} catalog files. ${errors} errors, ${warnings} warnings.`
  );
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && process.argv[1].endsWith("stale-i18n")) {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
