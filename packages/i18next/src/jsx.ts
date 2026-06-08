import { arrayOf, jsxName, stringLiteral, type AnyNode } from "@stale-i18n/core";

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
