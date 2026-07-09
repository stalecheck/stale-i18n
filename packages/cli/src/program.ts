import { createRequire } from "node:module";
import { Command, CommanderError, Option } from "commander";
import {
  RULE_DEFINITIONS,
  RULE_LEVEL,
  type RULE_LEVEL as RULE_LEVEL_TYPE,
  type RuleCode,
  type RuleOverrides
} from "@stale-i18n/core";
import { FormatjsChecker, type FormatjsCheckOptions } from "@stale-i18n/formatjs";
import {
  I18nextChecker,
  type I18nextCheckMode,
  type I18nextCheckOptions
} from "@stale-i18n/i18next";
import { formatRunResult, invalid, type CliFormat, type CliRunResult } from "./formatting.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

type I18nextCommandOptions = CommonCommandOptions & {
  mode?: I18nextCheckMode;
  defaultNamespace?: string;
};

type FormatjsCommandOptions = CommonCommandOptions;

type CommonCommandOptions = {
  catalog?: string[];
  ignore?: string[];
  rule?: RuleOverrides;
  format?: CliFormat;
};

type CommandDefinition = {
  name: string;
  description: string;
  configure: (command: Command, setResult: (result: CliRunResult) => void) => void;
};

const COMMAND_DEFINITIONS = [
  {
    name: "i18next",
    description: "Check react-i18next source files against i18next JSON catalogs.",
    configure: configureI18nextCommand
  },
  {
    name: "formatjs",
    description: "Check React Intl and FormatJS source files against JSON catalogs.",
    configure: configureFormatjsCommand
  }
] satisfies CommandDefinition[];

const SUBCOMMAND_LIST_FORMATTER = new Intl.ListFormat("en", {
  style: "long",
  type: "disjunction"
});

const RULE_LEVEL_LIST_FORMATTER = new Intl.ListFormat("en", {
  style: "long",
  type: "disjunction"
});

const PROHIBITED_OPTIONS = new Set([
  "--library",
  "--ignored-keys",
  "--custom-regexp-to-find-keys",
  "--deep-search"
]);

export async function runCli(argv: string[]): Promise<CliRunResult> {
  if (argv.length === 0) {
    return invalid(expectedSubcommandMessage());
  }

  const prohibitedOption = argv.find((arg) => PROHIBITED_OPTIONS.has(arg));
  if (prohibitedOption) {
    return invalid(`Option ${prohibitedOption} is not supported`);
  }

  let stdout = "";
  let stderr = "";
  let result: CliRunResult | undefined;
  const program = createProgram((value) => {
    result = value;
  });

  program.configureOutput({
    writeOut: (text) => {
      stdout += text;
    },
    writeErr: (text) => {
      stderr += text;
    },
    outputError: (text, write) => {
      write(text);
    }
  });
  for (const command of program.commands) {
    command.configureOutput(program.configureOutput());
  }
  program.exitOverride((error) => {
    throw error;
  });
  for (const command of program.commands) {
    command.exitOverride((error) => {
      throw error;
    });
  }

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return {
        exitCode: error.exitCode === 0 ? 0 : 2,
        stdout,
        stderr
      };
    }
    return invalid(error instanceof Error ? error.message : "Invalid arguments");
  }

  if (result) return result;
  return invalid(expectedSubcommandMessage());
}

function createProgram(setResult: (result: CliRunResult) => void): Command {
  const program = new Command();

  program
    .name("stale-i18n")
    .description("Check JavaScript and TypeScript projects for stale i18n keys.")
    .version(packageJson.version)
    .showHelpAfterError()
    .showSuggestionAfterError();

  for (const definition of COMMAND_DEFINITIONS) {
    const command = program.command(definition.name).description(definition.description);
    definition.configure(command, setResult);
  }

  return program;
}

function configureI18nextCommand(
  command: Command,
  setResult: (result: CliRunResult) => void
): void {
  command
    .argument("<target>", "Source file or directory to scan.")
    .addOption(catalogOption())
    .addOption(ignoreOption())
    .addOption(ruleOption())
    .addOption(formatOption())
    .addOption(
      new Option("--default-namespace <name>", 'Namespace used by unqualified t("key") calls.')
    )
    .addOption(new Option("--mode <mode>", "Source analysis mode.").choices(["jsx"]))
    .action(async (target: string, options: I18nextCommandOptions) => {
      const checkOptions: I18nextCheckOptions = {
        target,
        catalogs: requiredCatalogs(options),
        ...(ignoredPaths(options).length === 0 ? {} : { ignore: ignoredPaths(options) }),
        ...(options.mode === undefined ? {} : { mode: options.mode }),
        ...(options.defaultNamespace === undefined
          ? {}
          : { defaultNamespace: options.defaultNamespace }),
        ...(Object.keys(rules(options)).length === 0 ? {} : { rules: rules(options) })
      };

      const checker = new I18nextChecker(checkOptions);
      setResult(formatRunResult(await checker.check(), outputFormat(options)));
    });
}

function configureFormatjsCommand(
  command: Command,
  setResult: (result: CliRunResult) => void
): void {
  command
    .argument("<target>", "Source file or directory to scan.")
    .addOption(catalogOption())
    .addOption(ignoreOption())
    .addOption(ruleOption())
    .addOption(formatOption())
    .action(async (target: string, options: FormatjsCommandOptions) => {
      const checkOptions: FormatjsCheckOptions = {
        target,
        catalogs: requiredCatalogs(options),
        ...(ignoredPaths(options).length === 0 ? {} : { ignore: ignoredPaths(options) }),
        ...(Object.keys(rules(options)).length === 0 ? {} : { rules: rules(options) })
      };

      const checker = new FormatjsChecker(checkOptions);
      setResult(formatRunResult(await checker.check(), outputFormat(options)));
    });
}

function expectedSubcommandMessage(): string {
  const commandNames = COMMAND_DEFINITIONS.map((definition) => quote(definition.name));
  return `Expected a subcommand: ${SUBCOMMAND_LIST_FORMATTER.format(commandNames)}`;
}

function quote(value: string): string {
  return `"${value}"`;
}

function catalogOption(): Option {
  return new Option("--catalog <pattern>", "Catalog path pattern. Repeat for multiple catalogs.")
    .argParser(collectValues)
    .makeOptionMandatory();
}

function ignoreOption(): Option {
  return new Option("--ignore <pattern>", "Source file or directory pattern to skip. Repeatable.")
    .argParser(collectValues)
    .default([]);
}

function ruleOption(): Option {
  return new Option("--rule <code=level>", `Override a rule level: ${formattedRuleLevels()}.`)
    .argParser(parseRuleOverride)
    .default({});
}

function formatOption(): Option {
  return new Option("--format <format>", "Output format.")
    .choices(["text", "json"])
    .default("text");
}

function collectValues(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function parseRuleOverride(value: string, previous: RuleOverrides | undefined): RuleOverrides {
  const [code, level] = value.split("=");
  if (!isRuleCode(code) || !isRuleLevel(level)) {
    throw new CommanderError(2, "stale-i18n.invalidRule", `Invalid rule "${value}"`);
  }
  return { ...(previous ?? {}), [code]: level };
}

function requiredCatalogs(options: CommonCommandOptions): string[] {
  return options.catalog ?? [];
}

function ignoredPaths(options: CommonCommandOptions): string[] {
  return options.ignore ?? [];
}

function rules(options: CommonCommandOptions): RuleOverrides {
  return options.rule ?? {};
}

function outputFormat(options: CommonCommandOptions): CliFormat {
  return options.format ?? "text";
}

function isRuleCode(value: string | undefined): value is RuleCode {
  return Boolean(value && value in RULE_DEFINITIONS);
}

function isRuleLevel(value: string | undefined): value is RULE_LEVEL_TYPE {
  return Boolean(value && value in RULE_LEVEL);
}

function formattedRuleLevels(): string {
  return RULE_LEVEL_LIST_FORMATTER.format(ruleLevelNames());
}

function ruleLevelNames(): RULE_LEVEL_TYPE[] {
  return Object.keys(RULE_LEVEL) as RULE_LEVEL_TYPE[];
}
