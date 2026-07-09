import {
  arrayOf,
  bindingNames,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createStaticStringContext,
  identifierName,
  jsxName,
  locationFromIndex,
  resolveStaticStrings,
  stringLiteral,
  walk,
  type SourceLocation,
  type SourceUsage,
  type StaticStringContext
} from "@stale-i18n/core";
import type { AnyNode } from "./types.js";

type DescriptorValues = Map<string, string[]>;

export function analyzeProgram(program: AnyNode, source: string, filePath: string): SourceUsage[] {
  const useIntlNames = new Set<string>();
  const formattedMessageNames = new Set<string>();
  const intlBindings = new Set<string>();
  const formatMessageBindings = new Set<string>();
  const staticStrings = createStaticStringContext();
  const descriptorValues: DescriptorValues = new Map();
  const usages: SourceUsage[] = [];

  walk(program, {
    enter(node, _parent, state) {
      if (node.type === "ImportDeclaration" && stringLiteral(node.source) === "react-intl") {
        for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
          const imported = identifierName(specifier.imported);
          const local = identifierName(specifier.local);
          if (imported === "useIntl" && local) {
            useIntlNames.add(local);
          }
          if (imported === "FormattedMessage" && local) {
            formattedMessageNames.add(local);
          }
        }
      }

      if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
      ) {
        const hidden = new Set(state.hidden);
        for (const param of arrayOf<AnyNode>(node.params)) {
          for (const name of bindingNames(param)) {
            hidden.add(name);
          }
        }
        return { hidden };
      }

      if (node.type === "BlockStatement") {
        const hidden = hiddenBindingsForBlock(
          node,
          [useIntlNames, formattedMessageNames, intlBindings, formatMessageBindings],
          useIntlNames
        );
        if (hidden.size > 0) {
          return { hidden: new Set([...state.hidden, ...hidden]) };
        }
      }

      if (node.type === "VariableDeclarator") {
        collectIntlBinding(node, useIntlNames, state.hidden, intlBindings, formatMessageBindings);
        collectStaticStringBinding(node, staticStrings);
        collectDescriptorBinding(node, staticStrings, descriptorValues);
      }

      if (node.type === "TSEnumDeclaration") {
        collectStaticStringEnum(node, staticStrings);
      }

      if (node.type === "CallExpression") {
        const calleeName = identifierName(node.callee);
        if (calleeName && formatMessageBindings.has(calleeName) && !state.hidden.has(calleeName)) {
          usages.push(
            ...usagesFromFormatMessage(node, source, filePath, staticStrings, descriptorValues)
          );
        }
        const member = memberExpressionName(node.callee as AnyNode | undefined);
        if (
          member?.property === "formatMessage" &&
          intlBindings.has(member.object) &&
          !state.hidden.has(member.object)
        ) {
          usages.push(
            ...usagesFromFormatMessage(node, source, filePath, staticStrings, descriptorValues)
          );
        }
      }

      if (node.type === "JSXElement") {
        const opening = node.openingElement as AnyNode | undefined;
        const name = jsxName(opening?.name as AnyNode | undefined);
        if (name && formattedMessageNames.has(name) && !state.hidden.has(name)) {
          usages.push(...usagesFromFormattedMessage(node, source, filePath, staticStrings));
        }
      }

      return undefined;
    }
  });

  return usages;
}

function collectIntlBinding(
  declarator: AnyNode,
  useIntlNames: Set<string>,
  hidden: Set<string>,
  intlBindings: Set<string>,
  formatMessageBindings: Set<string>
) {
  const init = declarator.init as AnyNode | undefined;
  const calleeName = identifierName(init?.callee);
  if (!init || init.type !== "CallExpression" || !calleeName || !useIntlNames.has(calleeName)) {
    return;
  }
  if (hidden.has(calleeName)) {
    return;
  }

  const id = declarator.id as AnyNode | undefined;
  const direct = identifierName(id);
  if (direct) {
    intlBindings.add(direct);
  }
  if (id?.type === "ObjectPattern") {
    for (const property of arrayOf<AnyNode>(id.properties)) {
      if (identifierName(property.key) === "formatMessage") {
        const local = identifierName(property.value);
        if (local) {
          formatMessageBindings.add(local);
        }
      }
    }
  }
}

function hiddenBindingsForBlock(
  node: AnyNode,
  trackedNames: Array<Set<string>>,
  useIntlNames: Set<string>
): Set<string> {
  const tracked = new Set(trackedNames.flatMap((names) => [...names]));
  const hidden = new Set<string>();

  for (const statement of arrayOf<AnyNode>(node.body)) {
    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of arrayOf<AnyNode>(statement.declarations)) {
      const init = declarator.init as AnyNode | undefined;
      if (init?.type === "CallExpression" && useIntlNames.has(identifierName(init.callee) ?? "")) {
        continue;
      }

      const id = declarator.id as AnyNode | undefined;
      for (const name of id ? bindingNames(id) : []) {
        if (tracked.has(name)) {
          hidden.add(name);
        }
      }
    }
  }

  return hidden;
}

function collectDescriptorBinding(
  declarator: AnyNode,
  staticStrings: StaticStringContext,
  descriptorValues: DescriptorValues
) {
  const name = identifierName(declarator.id);
  if (!name) {
    return;
  }

  const values = idValuesFromDescriptor(declarator.init as AnyNode | undefined, staticStrings);
  if (values === undefined) {
    descriptorValues.delete(name);
    return;
  }

  descriptorValues.set(name, values);
}

function usagesFromFormatMessage(
  call: AnyNode,
  source: string,
  filePath: string,
  staticStrings: StaticStringContext,
  descriptorValues: DescriptorValues
): SourceUsage[] {
  const descriptor = arrayOf<AnyNode>(call.arguments)[0];
  const location = nodeLocation(call, source);
  const ids =
    idValuesFromDescriptor(descriptor, staticStrings) ??
    descriptorValues.get(identifierName(descriptor) ?? "");

  if (ids === undefined) {
    return [unresolvedUsage(call, descriptor, source, filePath, location, "call")];
  }

  return ids.map((id) => resolvedUsage(id, filePath, location, "call"));
}

function usagesFromFormattedMessage(
  element: AnyNode,
  source: string,
  filePath: string,
  staticStrings: StaticStringContext
): SourceUsage[] {
  const attribute = jsxAttributeNode(element, "id");
  const location = nodeLocation(element, source);
  if (!attribute) {
    return [];
  }

  const ids = resolveJsxAttributeValues(attribute, staticStrings);
  if (ids === undefined) {
    return [unresolvedUsage(element, attribute, source, filePath, location, "jsx-component")];
  }

  return ids.map((id) => resolvedUsage(id, filePath, location, "jsx-component"));
}

function idValuesFromDescriptor(
  node: AnyNode | undefined,
  staticStrings: StaticStringContext
): string[] | undefined {
  if (!node || node.type !== "ObjectExpression") {
    return undefined;
  }

  const idProperty = arrayOf<AnyNode>(node.properties).find(
    (property) => identifierName(property.key) === "id"
  );
  return resolveStaticStrings(idProperty?.value as AnyNode | undefined, staticStrings);
}

function jsxAttributeNode(element: AnyNode, name: string): AnyNode | undefined {
  const opening = element.openingElement as AnyNode | undefined;
  return arrayOf<AnyNode>(opening?.attributes).find(
    (attribute) => jsxName(attribute.name as AnyNode | undefined) === name
  );
}

function resolveJsxAttributeValues(
  attribute: AnyNode,
  staticStrings: StaticStringContext
): string[] | undefined {
  const value = attribute.value as AnyNode | undefined;
  if (!value) {
    return undefined;
  }

  if (value.type === "JSXExpressionContainer") {
    return resolveStaticStrings(value.expression as AnyNode | undefined, staticStrings);
  }

  return resolveStaticStrings(value, staticStrings);
}

function memberExpressionName(
  node: AnyNode | undefined
): { object: string; property: string } | null {
  if (node?.type !== "MemberExpression") {
    return null;
  }

  const object = identifierName(node.object);
  const property = identifierName(node.property);
  return object && property ? { object, property } : null;
}

function resolvedUsage(
  id: string,
  filePath: string,
  location: SourceLocation,
  sourceKind: "call" | "jsx-component"
): SourceUsage {
  return {
    kind: "resolved",
    message: { id },
    filePath,
    location,
    sourceKind
  };
}

function unresolvedUsage(
  fallbackNode: AnyNode,
  rawNode: AnyNode | undefined,
  source: string,
  filePath: string,
  location: SourceLocation,
  sourceKind: "call" | "jsx-component"
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
    sourceKind
  };
}

function nodeLocation(node: AnyNode, source: string): SourceLocation {
  return locationFromIndex(source, node.start ?? 0);
}
