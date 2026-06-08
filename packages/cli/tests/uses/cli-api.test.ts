import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "@stale-i18n/cli";

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "stale-i18n-cli-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  mkdirSync(path.join(dir, "locales", "en"), { recursive: true });
  mkdirSync(path.join(dir, "locales", "es"), { recursive: true });
  writeFileSync(
    path.join(dir, "src", "App.tsx"),
    [
      'import { useTranslation } from "react-i18next";',
      "export function App() {",
      "  const { t } = useTranslation();",
      '  return <span>{t("save")}</span>;',
      "}"
    ].join("\n")
  );
  writeFileSync(path.join(dir, "locales", "en", "translation.json"), '{"save":"Save"}');
  writeFileSync(path.join(dir, "locales", "es", "translation.json"), '{"save":"Guardar"}');
  return dir;
}

describe("CLI", () => {
  it("runs i18next with JSON output and exit code 0", async () => {
    const dir = fixture();
    const result = await runCli([
      "i18next",
      path.join(dir, "src"),
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--format",
      "json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ status: "SUCCESS", diagnostics: [] })
    );
  });

  it("parses rules, prints grouped text, and returns exit code 1 for errors", async () => {
    const dir = fixture();
    writeFileSync(path.join(dir, "locales", "es", "translation.json"), "{}");

    const result = await runCli([
      "i18next",
      path.join(dir, "src"),
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--rule",
      "unused-translation-key=warning"
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Checked 1 source files and 2 catalog files");
    expect(result.stdout).toContain("missing-locale-key");
  });

  it("returns exit code 2 for invalid arguments and prohibited options", async () => {
    await expect(runCli(["i18next", "src", "--library", "react-i18next"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(runCli(["i18next", "src", "--deep-search"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
  });
});
