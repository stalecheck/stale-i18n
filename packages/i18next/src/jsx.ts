import { stringLiteral } from "./ast.js";
import type { AnyNode } from "./types.js";

export function jsxAttributes(element: AnyNode): Map<string, string> {
  const attrs = new Map<string, string>();
  const opening = element.openingElement as AnyNode | undefined;
  for (const attribute of arrayOf<AnyNode>(opening?.attributes)) {
    const name = jsxName(attribute.name as AnyNode | undefined);
    const value = jsxAttributeStringValue(attribute);
    if (name && value !== undefined) {
      attrs.set(name, value);
    }
  }
  return attrs;
}

export function jsxAttributeStringValue(attribute: AnyNode): string | undefined {
  const value = attribute.value as AnyNode | undefined;
  if (!value) return undefined;
  if (value.type === "Literal") return typeof value.value === "string" ? value.value : undefined;
  if (value.type === "StringLiteral")
    return typeof value.value === "string" ? value.value : undefined;
  if (value.type === "JSXExpressionContainer") return stringLiteral(value.expression as AnyNode);
  return undefined;
}

export function jsxName(node: AnyNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "JSXIdentifier" && typeof node.name === "string") return node.name;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  return undefined;
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
