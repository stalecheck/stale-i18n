import { getRuleLevel } from "./rules.js";
import type {
  CheckResult,
  ConfigurationDiagnosticCode,
  Diagnostic,
  RuleCode,
  RuleOverrides
} from "./types.js";

export type CreateDiagnosticInput = {
  code: RuleCode;
  rules?: RuleOverrides | undefined;
  message: string;
  filePath: string;
  line: number;
  column: number;
  key?: string | undefined;
  locale?: string | undefined;
  catalogPath?: string | undefined;
};

export type CreateConfigurationDiagnosticInput = {
  code: ConfigurationDiagnosticCode;
  message: string;
  filePath: string;
  line: number;
  column: number;
};

export function createDiagnostic(input: CreateDiagnosticInput): Diagnostic | null {
  const severity = getRuleLevel(input.code, input.rules);
  if (severity === "off") {
    return null;
  }

  return {
    code: input.code,
    severity,
    message: input.message,
    filePath: input.filePath,
    line: input.line,
    column: input.column,
    ...(input.key === undefined ? {} : { key: input.key }),
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    ...(input.catalogPath === undefined ? {} : { catalogPath: input.catalogPath })
  };
}

export function createConfigurationDiagnostic(
  input: CreateConfigurationDiagnosticInput
): Diagnostic {
  return {
    code: input.code,
    severity: "error",
    message: input.message,
    filePath: input.filePath,
    line: input.line,
    column: input.column
  };
}

export function isConfigurationDiagnostic(
  diagnostic: Diagnostic
): diagnostic is Diagnostic & { code: ConfigurationDiagnosticCode } {
  return (
    diagnostic.code === "invalid-configuration" ||
    diagnostic.code === "source-target-not-found" ||
    diagnostic.code === "catalog-target-not-found"
  );
}

export function createResult(
  diagnostics: Array<Diagnostic | null>,
  filesChecked: number,
  catalogsChecked: number
): CheckResult {
  const compactDiagnostics = diagnostics.filter((diagnostic): diagnostic is Diagnostic =>
    Boolean(diagnostic)
  );
  return {
    status: compactDiagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? "FAIL"
      : "SUCCESS",
    diagnostics: compactDiagnostics,
    filesChecked,
    catalogsChecked
  };
}
