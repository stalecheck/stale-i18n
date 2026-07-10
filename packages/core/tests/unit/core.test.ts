import { describe, expect, it } from "vitest";
import {
  arrayOf,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createConfigurationDiagnostic,
  createDiagnostic,
  createResult,
  createSourceScope,
  createStaticStringContext,
  discoverSourceFiles,
  expandCatalogPattern,
  formatSourceTarget,
  sourceTargetExists,
  getRuleLevel,
  identifierName,
  isConfigurationDiagnostic,
  locationFromIndex,
  parseSource,
  resolveStaticStrings,
  RULE_DEFINITIONS,
  walk
} from "@stale-i18n/core";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AnyNode, SourceUsage } from "@stale-i18n/core";

describe("core result helpers", () => {
  it("marks results with errors as FAIL and warning-only results as SUCCESS", () => {
    const warning = createDiagnostic({
      code: "unused-translation-key",
      rules: { "unused-translation-key": "warning" },
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

  it("identifies non-disableable configuration diagnostics", () => {
    const diagnostic = createConfigurationDiagnostic({
      code: "catalog-target-not-found",
      message: "No catalog targets were configured.",
      filePath: process.cwd(),
      line: 1,
      column: 1
    });

    expect(isConfigurationDiagnostic(diagnostic)).toBe(true);
    expect(createResult([diagnostic], 0, 0).status).toBe("FAIL");
  });

  it("merges rule levels and drops diagnostics for disabled rules", () => {
    expect(RULE_DEFINITIONS["unused-translation-key"].defaultLevel).toBe("error");
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

  it("walks AST nodes and exposes shared node helpers", () => {
    const parsed = parseSource("src/app.ts", "const title = 'Title';");
    const names: string[] = [];

    walk(parsed.program, {
      enter(node) {
        const name = identifierName(node);
        if (name) {
          names.push(name);
        }
        return undefined;
      }
    });

    expect(names).toContain("title");
    expect(arrayOf<unknown>(undefined)).toEqual([]);
  });

  it("distinguishes shadowed bindings and detects mutations with Oxc ASTs", () => {
    const parsed = parseSource(
      "src/app.tsx",
      `
        const id = "outer";
        function inner() {
          const id = "inner";
          return id;
        }
        let mutable = "safe";
        mutable = dynamic;
        id;
      `
    );
    const scope = createSourceScope(parsed.program as AnyNode);
    const ids: AnyNode[] = [];
    let mutableDeclaration: AnyNode | undefined;

    walk(parsed.program, {
      enter(node, parent) {
        if (node.type === "Identifier" && node.name === "id") {
          ids.push(node);
        }
        if (
          node.type === "Identifier" &&
          node.name === "mutable" &&
          parent?.type === "VariableDeclarator"
        ) {
          mutableDeclaration = node;
        }
        return undefined;
      }
    });

    expect(scope.bindingId(ids[0])).toBe(scope.bindingId(ids.at(-1)));
    expect(scope.bindingId(ids[0])).not.toBe(scope.bindingId(ids[1]));
    expect(scope.isConstant(ids[0])).toBe(true);
    expect(scope.isStable(mutableDeclaration)).toBe(false);
  });

  it("detects direct, conditional, destructuring, compound, and update writes", () => {
    const parsed = parseSource(
      "src/writes.ts",
      `
        let stable = "stable";
        let direct = "direct";
        direct = dynamic;
        let conditional = "conditional";
        if (condition) conditional = dynamic;
        let destructured = "destructured";
        ({ value: destructured } = input);
        let compound = "compound";
        compound += suffix;
        let logicalOr = "logicalOr";
        logicalOr ||= fallback;
        let logicalAnd = "logicalAnd";
        logicalAnd &&= fallback;
        let nullish = "nullish";
        nullish ??= fallback;
        let updated = 0;
        updated++;
      `
    );
    const scope = createSourceScope(parsed.program as AnyNode);
    const declarations = new Map<string, AnyNode>();

    walk(parsed.program, {
      enter(node) {
        if (node.type === "VariableDeclarator") {
          const name = identifierName(node.id);
          if (name) declarations.set(name, node.id as AnyNode);
        }
        return undefined;
      }
    });

    expect(scope.isStable(declarations.get("stable"))).toBe(true);
    for (const name of [
      "direct",
      "conditional",
      "destructured",
      "compound",
      "logicalOr",
      "logicalAnd",
      "nullish",
      "updated"
    ]) {
      expect(scope.isStable(declarations.get(name))).toBe(false);
    }
  });

  it("tracks closure writes without poisoning a shadowed outer binding", () => {
    const parsed = parseSource(
      "src/closure-writes.ts",
      `
        const id = "outer";
        let shared = "shared";
        function mutateShared() {
          shared = dynamic;
        }
        function mutateShadow() {
          let id = "inner";
          id = dynamic;
          return id;
        }
        id;
      `
    );
    const scope = createSourceScope(parsed.program as AnyNode);
    const declarations = new Map<string, AnyNode[]>();

    walk(parsed.program, {
      enter(node) {
        if (node.type === "VariableDeclarator") {
          const name = identifierName(node.id);
          if (name) declarations.set(name, [...(declarations.get(name) ?? []), node.id as AnyNode]);
        }
        return undefined;
      }
    });

    expect(scope.isStable(declarations.get("shared")?.[0])).toBe(false);
    expect(scope.isStable(declarations.get("id")?.[0])).toBe(true);
    expect(scope.isStable(declarations.get("id")?.[1])).toBe(false);
    expect(scope.bindingId(declarations.get("id")?.[0])).not.toBe(
      scope.bindingId(declarations.get("id")?.[1])
    );
  });

  it("resolves only immutable const bindings and restores static values across scopes", () => {
    const parsed = parseSource(
      "src/static-scopes.ts",
      `
        const key = "outer";
        let mutableKey = "mutable";
        function inner() {
          const key = "inner";
          return key;
        }
        key;
      `
    );
    const scope = createSourceScope(parsed.program as AnyNode);
    const context = createStaticStringContext(scope);
    const keyNodes: AnyNode[] = [];
    let mutableKey: AnyNode | undefined;

    walk(parsed.program, {
      enter(node, parent) {
        if (node.type === "VariableDeclarator") {
          collectStaticStringBinding(node, context);
          if (identifierName(node.id) === "mutableKey") mutableKey = node.id as AnyNode;
        }
        if (
          node.type === "Identifier" &&
          node.name === "key" &&
          (parent?.type === "ReturnStatement" || parent?.type === "ExpressionStatement")
        ) {
          keyNodes.push(node);
        }
        return undefined;
      }
    });

    expect(resolveStaticStrings(keyNodes[0], context)).toEqual(["inner"]);
    expect(resolveStaticStrings(keyNodes[1], context)).toEqual(["outer"]);
    expect(resolveStaticStrings(mutableKey, context)).toBeUndefined();
  });

  it("resolves static string literals, arrays, constants, templates, ternaries, and enums", () => {
    const source = `
      enum MessageId { Title = "title" }
      const state = Math.random() > 0.5 ? "ready" : "pending";
      const direct = "save";
      const template = \`status.\${state}\`;
      const list = ["fallback", direct];
    `;
    const parsed = parseSource("src/app.ts", source);
    const context = createStaticStringContext();
    const declarations = new Map<string, AnyNode>();
    let enumReference: AnyNode | undefined;

    walk(parsed.program, {
      enter(node) {
        if (node.type === "TSEnumDeclaration") {
          collectStaticStringEnum(node, context);
          enumReference = {
            type: "MemberExpression",
            object: node.id,
            property: { type: "Identifier", name: "Title" }
          };
        }
        if (node.type === "VariableDeclarator") {
          collectStaticStringBinding(node, context);
          const name = identifierName(node.id);
          if (name) {
            declarations.set(name, node);
          }
        }
        return undefined;
      }
    });

    expect(resolveStaticStrings(declarations.get("direct")?.init as AnyNode, context)).toEqual([
      "save"
    ]);
    expect(resolveStaticStrings(declarations.get("template")?.init as AnyNode, context)).toEqual([
      "status.ready",
      "status.pending"
    ]);
    expect(resolveStaticStrings(declarations.get("list")?.init as AnyNode, context)).toEqual([
      "fallback",
      "save"
    ]);
    expect(resolveStaticStrings(enumReference, context)).toEqual(["title"]);
  });

  function sourceDiscoveryFixture() {
    const dir = mkdtempSync(path.join(tmpdir(), "i18n-core-files-"));
    mkdirSync(path.join(dir, "src"));
    mkdirSync(path.join(dir, "src", "nested"));
    mkdirSync(path.join(dir, "src", "generated"));
    mkdirSync(path.join(dir, "src", "dist"));
    mkdirSync(path.join(dir, "src", "coverage"));
    mkdirSync(path.join(dir, "src", "node_modules", "pkg"), { recursive: true });
    writeFileSync(path.join(dir, "src", "app.tsx"), "export const app = 1;");
    writeFileSync(path.join(dir, "src", "nested", "helper.ts"), "export const helper = 1;");
    writeFileSync(path.join(dir, "src", "generated", "messages.ts"), "export const generated = 1;");
    writeFileSync(path.join(dir, "src", "nested", "view.tsx"), "export const view = 1;");
    writeFileSync(path.join(dir, "src", "dist", "bundle.ts"), "export const bundle = 1;");
    writeFileSync(path.join(dir, "src", "coverage", "report.ts"), "export const report = 1;");
    writeFileSync(
      path.join(dir, "src", "node_modules", "pkg", "index.ts"),
      "export const pkg = 1;"
    );
    writeFileSync(path.join(dir, "src", "readme.md"), "# docs");
    return dir;
  }

  it("discovers source files from a directory or a single source file", () => {
    const dir = sourceDiscoveryFixture();

    expect(discoverSourceFiles(path.join(dir, "src"))).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "generated", "messages.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "nested", "view.tsx")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src", "app.tsx"))).toEqual([
      path.join(dir, "src", "app.tsx")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src", "readme.md"))).toEqual([]);
  });

  it("discovers source files from target arrays and removes duplicates", () => {
    const dir = sourceDiscoveryFixture();

    expect(
      discoverSourceFiles([
        path.join(dir, "src", "app.tsx"),
        path.join(dir, "src", "nested"),
        path.join(dir, "src", "nested", "helper.ts")
      ])
    ).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "nested", "view.tsx")
    ]);
  });

  it("discovers source files from target glob patterns", () => {
    const dir = sourceDiscoveryFixture();

    expect(discoverSourceFiles(path.join(dir, "src", "**", "*.tsx"))).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "nested", "view.tsx")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src", "**", "*.vue"))).toEqual([]);
  });

  it("treats an existing path containing glob metacharacters as a literal directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "i18n-core-literal-magic-"));
    const sourceDir = path.join(dir, "src[legacy]");
    mkdirSync(sourceDir);
    writeFileSync(path.join(sourceDir, "app.ts"), "export const app = 1;");

    expect(sourceTargetExists(sourceDir)).toBe(true);
    expect(discoverSourceFiles(sourceDir)).toEqual([path.join(sourceDir, "app.ts")]);
  });

  it("applies ignorePaths globs to directory, file, and glob targets", () => {
    const dir = sourceDiscoveryFixture();

    expect(discoverSourceFiles(path.join(dir, "src", "**", "*.ts"), ["generated/**"])).toEqual([
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src"), ["nested/**"])).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "generated", "messages.ts"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src"), ["generated"])).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "nested", "view.tsx"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src"), ["generated/**"])).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "nested", "view.tsx"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src"), ["**/messages.ts"])).toEqual([
      path.join(dir, "src", "app.tsx"),
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "nested", "view.tsx"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
    expect(
      discoverSourceFiles(path.join(dir, "src", "generated", "messages.ts"), ["messages.ts"])
    ).toEqual([]);
    expect(
      discoverSourceFiles(path.join(dir, "src", "**", "*.ts"), [
        path.join(dir, "src", "nested", "helper.ts")
      ])
    ).toEqual([
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "generated", "messages.ts"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
  });

  it("uses default ignore paths only when ignorePaths is omitted", () => {
    const dir = sourceDiscoveryFixture();

    expect(discoverSourceFiles(path.join(dir, "src", "**", "*.ts"))).toEqual([
      path.join(dir, "src", "generated", "messages.ts"),
      path.join(dir, "src", "nested", "helper.ts")
    ]);
    expect(discoverSourceFiles(path.join(dir, "src", "**", "*.ts"), [])).toEqual([
      path.join(dir, "src", "coverage", "report.ts"),
      path.join(dir, "src", "dist", "bundle.ts"),
      path.join(dir, "src", "generated", "messages.ts"),
      path.join(dir, "src", "nested", "helper.ts"),
      path.join(dir, "src", "node_modules", "pkg", "index.ts")
    ]);
  });

  it("reports source target existence for literals, globs, and arrays", () => {
    const dir = sourceDiscoveryFixture();

    expect(sourceTargetExists(path.join(dir, "src"))).toBe(true);
    expect(sourceTargetExists(path.join(dir, "src", "app.tsx"))).toBe(true);
    expect(sourceTargetExists(path.join(dir, "missing-src"))).toBe(false);
    expect(sourceTargetExists(path.join(dir, "src", "**/*.tsx"))).toBe(true);
    expect(sourceTargetExists(path.join(dir, "src", "**/*.vue"))).toBe(false);
    expect(
      sourceTargetExists([path.join(dir, "src", "missing"), path.join(dir, "src", "**/*.tsx")])
    ).toBe(true);
  });

  it("formats single and multiple source targets for diagnostics", () => {
    const dir = sourceDiscoveryFixture();

    expect(formatSourceTarget(path.join(dir, "src"))).toBe(path.join(dir, "src"));
    expect(formatSourceTarget([path.join(dir, "src"), path.join(dir, "missing-src")])).toBe(
      `${path.join(dir, "src")}, ${path.join(dir, "missing-src")}`
    );
  });

  it("expands catalog patterns and captures locale and namespace metadata", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "i18n-core-catalog-pattern-"));
    const validFile = path.join(dir, "catalogs[legacy]", "checkout", "es-ES", "messages.json");
    const repeatedFile = path.join(dir, "repeated", "en", "messages.en.json");
    const mismatchFile = path.join(dir, "repeated", "fr", "messages.de.json");
    mkdirSync(path.dirname(validFile), { recursive: true });
    mkdirSync(path.dirname(repeatedFile), { recursive: true });
    mkdirSync(path.dirname(mismatchFile), { recursive: true });
    writeFileSync(validFile, "{}");
    writeFileSync(repeatedFile, "{}");
    writeFileSync(mismatchFile, "{}");

    expect(
      expandCatalogPattern(
        path.join(dir, "catalogs[legacy]", "{namespace}", "{locale}", "messages.json")
      )
    ).toEqual([{ filePath: validFile, namespace: "checkout", locale: "es-ES" }]);
    expect(
      expandCatalogPattern(path.join(dir, "repeated", "{locale}", "messages.{locale}.json"))
    ).toEqual([{ filePath: repeatedFile, locale: "en" }]);
  });

  it("returns no catalog paths when a placeholder root does not exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "i18n-core-missing-catalog-root-"));

    expect(expandCatalogPattern(path.join(dir, "missing", "{locale}.json"))).toEqual([]);
  });

  it("returns no source files for missing literal targets", () => {
    const dir = sourceDiscoveryFixture();

    expect(discoverSourceFiles(path.join(dir, "missing-src"))).toEqual([]);
  });
});
