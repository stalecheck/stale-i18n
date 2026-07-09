import { createDiagnostic, jsxName, locationFromIndex, type Diagnostic } from "@stale-i18n/core";
import { jsxAttributeStringValue } from "./jsx.js";
import type { AnyNode, I18nextCheckOptions } from "./types.js";

export function rawUiTextDiagnostic(
  node: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): Diagnostic | null {
  if (node.type === "JSXText") {
    const value = typeof node.value === "string" ? node.value : "";
    return createRawTextDiagnostic(value, node, source, filePath, options);
  }

  if (node.type === "JSXAttribute") {
    const name = jsxName(node.name as AnyNode | undefined);
    if (!name || !rawAttributeAllowed(name)) {
      return null;
    }
    const value = jsxAttributeStringValue(node);
    return value ? createRawTextDiagnostic(value, node, source, filePath, options) : null;
  }

  return null;
}

function rawAttributeAllowed(name: string): boolean {
  return ["title", "aria-label", "alt", "placeholder", "label"].includes(name);
}

function createRawTextDiagnostic(
  value: string,
  node: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): Diagnostic | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "" || !/[A-Za-zÀ-ÿ]/.test(text) || /^\d+$/.test(text)) {
    return null;
  }
  const location = locationFromIndex(source, node.start ?? 0);
  return createDiagnostic({
    code: "raw-ui-text",
    rules: options.rules,
    message: `Raw UI text "${text}" should use i18next`,
    filePath,
    line: location.line,
    column: location.column,
    key: text
  });
}
