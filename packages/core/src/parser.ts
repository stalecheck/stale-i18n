import { parseSync } from "oxc-parser";
import { locationFromIndex } from "./source-location.js";
import type { Diagnostic } from "./types.js";

export type ParseSourceResult = {
  program: object | null;
  diagnostics: Diagnostic[];
};

export function parseSource(filePath: string, source: string): ParseSourceResult {
  const parsed = parseSync(filePath, source, {
    sourceType: "module",
    range: true
  });
  if (parsed.errors.length === 0) {
    return { program: parsed.program, diagnostics: [] };
  }

  return {
    program: null,
    diagnostics: parsed.errors.map((error) => {
      const rawStart = Reflect.get(error, "start");
      const start = typeof rawStart === "number" ? rawStart : 0;
      const location = locationFromIndex(source, start);
      return {
        code: "source-parse-error",
        severity: "error",
        message: error.message,
        filePath,
        line: location.line,
        column: location.column
      };
    })
  };
}
