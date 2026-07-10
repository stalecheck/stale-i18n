import {
  arrayOf,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createSourceScope,
  createStaticStringContext,
  identifierName,
  locationFromIndex,
  resolveStaticStrings,
  stringLiteral,
  walk,
  type SourceLocation,
  type SourceUsage
} from "@stale-i18n/core";
import type { AnyNode } from "./types.js";

export function analyzeProgram(program: AnyNode, source: string, filePath: string): SourceUsage[] {
  const scope = createSourceScope(program);
  const messageBindings = new Set<number>();
  const staticStrings = createStaticStringContext(scope);
  const usages: SourceUsage[] = [];

  walk(program, {
    enter(node) {
      if (
        node.type === "ImportDeclaration" &&
        isParaglideMessagesImport(stringLiteral(node.source))
      ) {
        for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
          const imported = identifierName(specifier.imported);
          const local = scope.bindingId(specifier.local);
          if (imported === "m" && local !== undefined) {
            messageBindings.add(local);
          }
        }
      }

      if (node.type === "VariableDeclarator") {
        collectStaticStringBinding(node, staticStrings);
      }

      if (node.type === "TSEnumDeclaration") {
        collectStaticStringEnum(node, staticStrings);
      }

      if (node.type === "CallExpression") {
        const callee = unwrapExpression(node.callee as AnyNode | undefined);
        const member = memberExpressionObject(callee);
        if (!member || !messageBindings.has(member.object)) {
          return undefined;
        }

        const location = nodeLocation(node, source);
        const ids = member.propertyValues;
        if (ids === undefined) {
          usages.push(unresolvedUsage(node, callee, source, filePath, location));
        } else {
          usages.push(...ids.map((id) => resolvedUsage(id, filePath, location)));
        }
      }

      return undefined;
    }
  });

  function memberExpressionObject(
    node: AnyNode | undefined
  ): { object: number; propertyValues: string[] | undefined } | null {
    if (node?.type !== "MemberExpression") {
      return null;
    }

    const object = scope.bindingId(node.object);
    if (object === undefined) {
      return null;
    }

    if (node.computed === true) {
      return {
        object,
        propertyValues: resolveStaticStrings(node.property as AnyNode | undefined, staticStrings)
      };
    }

    const property = identifierName(node.property);
    return property ? { object, propertyValues: [property] } : null;
  }

  return usages;
}

function isParaglideMessagesImport(source: string | undefined): boolean {
  if (!source) {
    return false;
  }

  return (
    source === "paraglide/messages" ||
    source.endsWith("/paraglide/messages") ||
    source.endsWith("/paraglide/messages.js") ||
    source.endsWith("/paraglide/messages.ts")
  );
}

function unwrapExpression(node: AnyNode | undefined): AnyNode | undefined {
  let current = node;
  while (
    current?.type === "TSAsExpression" ||
    current?.type === "TSSatisfiesExpression" ||
    current?.type === "TSNonNullExpression"
  ) {
    current = current.expression as AnyNode | undefined;
  }
  return current;
}

function resolvedUsage(id: string, filePath: string, location: SourceLocation): SourceUsage {
  return {
    kind: "resolved",
    message: { id },
    filePath,
    location,
    sourceKind: "generated-message-function"
  };
}

function unresolvedUsage(
  fallbackNode: AnyNode,
  rawNode: AnyNode | undefined,
  source: string,
  filePath: string,
  location: SourceLocation
): SourceUsage {
  return {
    kind: "unresolved",
    raw: source.slice(
      rawNode?.start ?? fallbackNode.start ?? 0,
      rawNode?.end ?? fallbackNode.end ?? 0
    ),
    reason: "dynamic-key",
    filePath,
    location,
    sourceKind: "generated-message-function"
  };
}

function nodeLocation(node: AnyNode, source: string): SourceLocation {
  return locationFromIndex(source, node.start ?? 0);
}
