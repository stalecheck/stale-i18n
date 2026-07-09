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

function rawUiTextFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "stale-i18n-cli-raw-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  mkdirSync(path.join(dir, "locales", "en"), { recursive: true });
  mkdirSync(path.join(dir, "locales", "es"), { recursive: true });
  writeFileSync(
    path.join(dir, "src", "App.tsx"),
    ["export function App() {", "  return <button>Save</button>;", "}"].join("\n")
  );
  writeFileSync(path.join(dir, "locales", "en", "translation.json"), "{}");
  writeFileSync(path.join(dir, "locales", "es", "translation.json"), "{}");
  return dir;
}

function formatjsFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "stale-i18n-cli-formatjs-"));
  mkdirSync(path.join(dir, "src"), { recursive: true });
  mkdirSync(path.join(dir, "locales"), { recursive: true });
  writeFileSync(
    path.join(dir, "src", "App.tsx"),
    [
      'import { FormattedMessage } from "react-intl";',
      "export function App() {",
      '  return <FormattedMessage id="save" />;',
      "}"
    ].join("\n")
  );
  writeFileSync(path.join(dir, "locales", "en.json"), '{"save":"Save"}');
  writeFileSync(path.join(dir, "locales", "es.json"), '{"save":"Guardar"}');
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

  it("ignores matching source files", async () => {
    const dir = fixture();
    mkdirSync(path.join(dir, "src", "nested"), { recursive: true });
    writeFileSync(
      path.join(dir, "src", "Ignored.tsx"),
      [
        'import { useTranslation } from "react-i18next";',
        "export function Ignored() {",
        "  const { t } = useTranslation();",
        '  return <span>{t("missing")}</span>;',
        "}"
      ].join("\n")
    );
    writeFileSync(
      path.join(dir, "src", "nested", "Nested.tsx"),
      [
        'import { useTranslation } from "react-i18next";',
        "export function Nested() {",
        "  const { t } = useTranslation();",
        '  return <span>{t("save")}</span>;',
        "}"
      ].join("\n")
    );

    const result = await runCli([
      "i18next",
      path.join(dir, "src", "**", "*.tsx"),
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--ignore-paths",
      "Ignored.tsx",
      "--format",
      "json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ status: "SUCCESS", filesChecked: 2, diagnostics: [] })
    );
  });

  it("enables raw UI text through rule configuration", async () => {
    const dir = rawUiTextFixture();

    const result = await runCli([
      "i18next",
      path.join(dir, "src"),
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--mode",
      "jsx",
      "--rule",
      "raw-ui-text=warning"
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("warning");
    expect(result.stdout).toContain("raw-ui-text");
  });

  it("runs formatjs with JSON output and exit code 0", async () => {
    const dir = formatjsFixture();
    const result = await runCli([
      "formatjs",
      path.join(dir, "src"),
      "--catalog",
      path.join(dir, "locales", "{locale}.json"),
      "--format",
      "json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({ status: "SUCCESS", diagnostics: [] })
    );
  });

  it("returns exit code 2 for invalid arguments and prohibited options", async () => {
    await expect(runCli([])).resolves.toEqual(
      expect.objectContaining({
        exitCode: 2,
        stderr: expect.stringContaining("Expected a subcommand")
      })
    );
    await expect(runCli(["i18next", "src", "--library", "react-i18next"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(runCli(["i18next", "src", "--deep-search"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(runCli(["i18next", "src", "--ignore", "**/*.test.ts"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(runCli(["i18next", "src", "--mode", "vue"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(runCli(["formatjs", "src", "--mode", "jsx"])).resolves.toEqual(
      expect.objectContaining({ exitCode: 2 })
    );
    await expect(
      runCli(["paraglide", "src", "--catalog", "messages/{locale}.json"])
    ).resolves.toEqual(expect.objectContaining({ exitCode: 2 }));
    await expect(
      runCli([
        "i18next",
        "src",
        "--catalog",
        "locales/{locale}/{namespace}.json",
        "--rule",
        "source-target-not-found=off"
      ])
    ).resolves.toEqual(expect.objectContaining({ exitCode: 2 }));
  });

  it("returns exit code 2 and JSON diagnostics for a missing source target", async () => {
    const dir = fixture();
    const missingTarget = path.join(dir, "missing-src");

    const result = await runCli([
      "i18next",
      missingTarget,
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--format",
      "json"
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        status: "FAIL",
        filesChecked: 0,
        diagnostics: [
          expect.objectContaining({
            code: "source-target-not-found",
            severity: "error",
            filePath: missingTarget
          })
        ]
      })
    );
  });

  it("returns exit code 2 and JSON diagnostics for a source target glob with no matches", async () => {
    const dir = fixture();
    const missingTarget = path.join(dir, "src", "**", "*.vue");

    const result = await runCli([
      "i18next",
      missingTarget,
      "--catalog",
      path.join(dir, "locales", "{locale}", "{namespace}.json"),
      "--format",
      "json"
    ]);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        status: "FAIL",
        filesChecked: 0,
        diagnostics: [
          expect.objectContaining({
            code: "source-target-not-found",
            severity: "error"
          })
        ]
      })
    );
  });

  it("prints Commander help for documented options", async () => {
    await expect(runCli(["i18next", "--help"])).resolves.toEqual(
      expect.objectContaining({
        exitCode: 0,
        stdout: expect.stringContaining("Check react-i18next source files")
      })
    );

    const result = await runCli(["formatjs", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--catalog <pattern>");
    expect(result.stdout).toContain("--ignore-paths <pattern>");
    expect(result.stdout).toContain("--format <format>");
  });
});
