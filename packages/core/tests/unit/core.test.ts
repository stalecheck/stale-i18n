import { describe, expect, it } from "vitest";
import {
  createDiagnostic,
  createResult,
  getRuleLevel,
  locationFromIndex,
  parseSource,
  RULE_DEFINITIONS
} from "@stale-i18n/core";
import type { SourceUsage } from "@stale-i18n/core";

describe("core result helpers", () => {
  it("marks results with errors as FAIL and warning-only results as SUCCESS", () => {
    const warning = createDiagnostic({
      code: "unused-translation-key",
      message: "Unused",
      filePath: "locales/en.json",
      line: 1,
      column: 1
    });
    const error = createDiagnostic({
      code: "missing-translation-key",
      message: "Missing",
      filePath: "src/App.tsx",
      line: 2,
      column: 3
    });

    expect(createResult([warning], 1, 1).status).toBe("SUCCESS");
    expect(createResult([warning, error], 1, 1).status).toBe("FAIL");
  });

  it("merges rule levels and drops diagnostics for disabled rules", () => {
    expect(RULE_DEFINITIONS["raw-ui-text"].defaultLevel).toBe("off");
    expect(getRuleLevel("raw-ui-text", { "raw-ui-text": "warning" })).toBe("warning");
    expect(
      createDiagnostic({
        code: "raw-ui-text",
        rules: { "raw-ui-text": "off" },
        message: "Raw text",
        filePath: "src/App.tsx",
        line: 1,
        column: 1
      })
    ).toBeNull();
  });

  it("converts character indexes to one-based source locations", () => {
    expect(locationFromIndex("first\nsecond", 7)).toEqual({
      index: 7,
      line: 2,
      column: 2
    });
  });

  it("represents resolved and unresolved source usages", () => {
    const usages: SourceUsage[] = [
      {
        kind: "resolved",
        message: { id: "save" },
        filePath: "src/App.tsx",
        location: { index: 0, line: 1, column: 1 },
        sourceKind: "call"
      },
      {
        kind: "unresolved",
        raw: "key",
        reason: "dynamic-key",
        filePath: "src/App.tsx",
        location: { index: 5, line: 1, column: 6 },
        sourceKind: "call"
      }
    ];

    expect(usages[0]?.kind).toBe("resolved");
    expect(usages[1]?.kind).toBe("unresolved");
  });

  it("converts source parse errors into diagnostics", () => {
    const result = parseSource("src/App.tsx", "export const = ;");

    expect(result.program).toBeNull();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "source-parse-error",
        severity: "error",
        filePath: "src/App.tsx"
      })
    ]);
  });
});
