import type { CheckResult, Diagnostic } from "@stale-i18n/core";

export type CliRunResult = {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
};

export type CliFormat = "text" | "json";

export function invalid(message: string): CliRunResult {
  return {
    exitCode: 2,
    stdout: "",
    stderr: message.endsWith("\n") ? message : `${message}\n`
  };
}

export function formatRunResult(result: CheckResult, format: CliFormat): CliRunResult {
  return {
    exitCode: exitCodeForResult(result),
    stdout: format === "json" ? `${JSON.stringify(result, null, 2)}\n` : formatText(result),
    stderr: ""
  };
}

function exitCodeForResult(result: CheckResult): 0 | 1 | 2 {
  if (result.diagnostics.some((diagnostic) => diagnostic.code === "source-target-not-found")) {
    return 2;
  }
  return result.status === "FAIL" ? 1 : 0;
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
