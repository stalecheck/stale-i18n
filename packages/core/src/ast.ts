import type { AnyNode } from "./types.js";

export function walk(
  node: unknown,
  visitor: {
    enter: (
      node: AnyNode,
      parent: AnyNode | null,
      state: { hidden: Set<string> }
    ) => { hidden: Set<string> } | undefined;
  },
  parent: AnyNode | null = null,
  state: { hidden: Set<string> } = { hidden: new Set() }
) {
  if (!isNode(node)) {
    return;
  }

  const nextState = visitor.enter(node, parent, state) ?? state;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        walk(child, visitor, node, nextState);
      }
    } else if (isNode(value)) {
      walk(value, visitor, node, nextState);
    }
  }
}

export function bindingNames(node: AnyNode): string[] {
  const direct = identifierName(node);
  if (direct) return [direct];
  if (node.type === "ObjectPattern") {
    return arrayOf<AnyNode>(node.properties).flatMap((property) =>
      bindingNames((property.value as AnyNode | undefined) ?? property)
    );
  }
  if (node.type === "ArrayPattern") {
    return arrayOf<AnyNode>(node.elements).flatMap(bindingNames);
  }
  return [];
}

export function isNode(value: unknown): value is AnyNode {
  return Boolean(value && typeof value === "object" && typeof (value as AnyNode).type === "string");
}

export function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function identifierName(node: unknown): string | undefined {
  return isNode(node) && node.type === "Identifier" && typeof node.name === "string"
    ? node.name
    : undefined;
}

export function jsxName(node: AnyNode | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "JSXIdentifier" && typeof node.name === "string") return node.name;
  if (node.type === "Identifier" && typeof node.name === "string") return node.name;
  return undefined;
}

export function literalValue(node: unknown): unknown {
  return isNode(node) && (node.type === "Literal" || node.type === "StringLiteral")
    ? node.value
    : undefined;
}

export function stringLiteral(node: unknown): string | undefined {
  const value = literalValue(node);
  return typeof value === "string" ? value : undefined;
}
