import { createDiagnostic, locationFromIndex, type Diagnostic } from "@stale-i18n/core";
import { jsxAttributeStringValue, jsxName } from "./jsx.js";
import type { AnyNode, I18nextCheckOptions, RawTextOptions } from "./types.js";

export function rawTextDiagnostic(
  node: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): Diagnostic | null {
  const rawText = options.rawText;
  if (!rawText || rawText.ignoreFiles?.some((pattern) => filePath.includes(pattern))) {
    return null;
  }

  if (node.type === "JSXText") {
    const value = typeof node.value === "string" ? node.value : "";
    return createRawTextDiagnostic(value, node, source, filePath, options);
  }

  if (node.type === "JSXAttribute") {
    const name = jsxName(node.name as AnyNode | undefined);
    if (!name || !rawAttributeAllowed(name, rawText)) {
      return null;
    }
    const value = jsxAttributeStringValue(node);
    return value ? createRawTextDiagnostic(value, node, source, filePath, options) : null;
  }

  return null;
}

function rawAttributeAllowed(name: string, rawText: RawTextOptions): boolean {
  const attributes = rawText.attributes ?? ["title", "aria-label", "alt", "placeholder", "label"];
  return (
    attributes.includes(name) ||
    Object.values(rawText.components ?? {}).some((props) => props.includes(name))
  );
}

function createRawTextDiagnostic(
  value: string,
  node: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): Diagnostic | null {
  const text = value.replace(/\s+/g, " ").trim();
  const rawText = options.rawText;
  if (!rawText || text === "" || !/[A-Za-zÀ-ÿ]/.test(text) || /^\d+$/.test(text)) {
    return null;
  }
  if (text.length < (rawText.minLength ?? 1)) {
    return null;
  }
  if (
    rawText.ignore?.some((ignore) =>
      typeof ignore === "string" ? ignore === text : ignore.test(text)
    )
  ) {
    return null;
  }
  const location = locationFromIndex(source, node.start ?? 0);
  return createDiagnostic({
    code: "raw-ui-text",
    rules: { ...options.rules, "raw-ui-text": options.rules?.["raw-ui-text"] ?? "warning" },
    message: `Raw UI text "${text}" should use i18next`,
    filePath,
    line: location.line,
    column: location.column,
    key: text
  });
}
