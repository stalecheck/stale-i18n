import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const temporaryDirectory = mkdtempSync(join(tmpdir(), "stale-i18n-package-smoke-"));
const tarballsDirectory = join(temporaryDirectory, "tarballs");
const consumerDirectory = join(temporaryDirectory, "consumer");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packages = ["core", "i18next", "formatjs", "paraglide", "cli"];

try {
  mkdirSync(tarballsDirectory);
  mkdirSync(consumerDirectory);

  for (const packageName of packages) {
    run(pnpm, ["pack", "--pack-destination", tarballsDirectory], join(root, "packages", packageName));
  }

  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "stale-i18n-package-smoke-consumer",
        private: true,
        type: "module",
        dependencies: packageTarballDependencies()
      },
      null,
      2
    )
  );
  writeFileSync(
    join(consumerDirectory, "pnpm-workspace.yaml"),
    `overrides:\n${Object.entries(packageTarballDependencies())
      .map(([packageName, tarball]) => `  \"${packageName}\": \"${tarball.split("\\").join("/")}\"`)
      .join("\n")}\n`
  );

  run(pnpm, ["install", "--ignore-scripts"], consumerDirectory);
  writeFixture(consumerDirectory);
  writeSmokeProgram(consumerDirectory);
  run(process.execPath, ["smoke.mjs"], consumerDirectory);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

function tarballFor(packageName) {
  const prefix = `stale-i18n-${packageName}-`;
  const tarball = readdirSync(tarballsDirectory).find(
    (fileName) => fileName.startsWith(prefix) && fileName.endsWith(".tgz")
  );

  if (!tarball) {
    throw new Error(`No tarball was created for @stale-i18n/${packageName}.`);
  }

  return tarball;
}

function packageTarballDependencies() {
  return Object.fromEntries(
    packages.map((packageName) => [
      `@stale-i18n/${packageName}`,
      `file:${join(tarballsDirectory, tarballFor(packageName)).split("\\").join("/")}`
    ])
  );
}

function writeFixture(directory) {
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "locales", "en"), { recursive: true });
  writeFileSync(
    join(directory, "src", "app.ts"),
    'import { useTranslation } from "react-i18next";\nconst { t } = useTranslation();\nt("welcome");\n'
  );
  writeFileSync(join(directory, "locales", "en", "translation.json"), '{"welcome":"Welcome"}\n');
}

function writeSmokeProgram(directory) {
  writeFileSync(
    join(directory, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { I18nextChecker } from "@stale-i18n/i18next";
import { FormatjsChecker } from "@stale-i18n/formatjs";
import { ParaglideChecker } from "@stale-i18n/paraglide";
import * as core from "@stale-i18n/core";
import { runCli } from "@stale-i18n/cli";

assert.equal(typeof I18nextChecker, "function");
assert.equal(typeof FormatjsChecker, "function");
assert.equal(typeof ParaglideChecker, "function");
assert.equal(typeof core.createResult, "function");
assert.equal(typeof runCli, "function");

const cli = fileURLToPath(new URL("./node_modules/@stale-i18n/cli/dist/index.js", import.meta.url));
const output = execFileSync(process.execPath, [cli, "i18next", "./src", "--catalog", "./locales/{locale}/{namespace}.json", "--format", "json"], {
  cwd: new URL(".", import.meta.url),
  encoding: "utf8"
});
assert.equal(JSON.parse(output).status, "SUCCESS");
`
  );
}

function run(command, arguments_, cwd) {
  execFileSync(command, arguments_, {
    cwd,
    shell: process.platform === "win32",
    stdio: "inherit"
  });
}
