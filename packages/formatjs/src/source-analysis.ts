import {
  arrayOf,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createSourceScope,
  createStaticStringContext,
  identifierName,
  jsxName,
  locationFromIndex,
  resolveStaticStrings,
  stringLiteral,
  walk,
  type SourceLocation,
  type SourceUsage,
  type BindingId,
  type StaticStringContext
} from "@stale-i18n/core";
import type { AnyNode } from "./types.js";

type DescriptorValues = Map<BindingId, string[]>;
type DescriptorMemberValues = Map<BindingId, Map<string, string[]>>;

export function analyzeProgram(program: AnyNode, source: string, filePath: string): SourceUsage[] {
  const scope = createSourceScope(program);
  const useIntlBindings = new Set<BindingId>();
  const formattedMessageBindings = new Set<BindingId>();
  const defineMessageBindings = new Set<BindingId>();
  const defineMessagesBindings = new Set<BindingId>();
  const intlBindings = new Set<BindingId>();
  const formatMessageBindings = new Set<BindingId>();
  const staticStrings = createStaticStringContext(scope);
  const descriptorValues: DescriptorValues = new Map();
  const descriptorMemberValues: DescriptorMemberValues = new Map();
  const usages: SourceUsage[] = [];

  walk(program, {
    enter(node) {
      if (node.type === "ImportDeclaration" && stringLiteral(node.source) === "react-intl") {
        for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
          const imported = identifierName(specifier.imported);
          const local = scope.bindingId(specifier.local);
          if (imported === "useIntl" && local !== undefined) {
            useIntlBindings.add(local);
          }
          if (imported === "FormattedMessage" && local !== undefined) {
            formattedMessageBindings.add(local);
          }
          if (imported === "defineMessage" && local !== undefined) {
            defineMessageBindings.add(local);
          }
          if (imported === "defineMessages" && local !== undefined) {
            defineMessagesBindings.add(local);
          }
        }
      }

      if (node.type === "VariableDeclarator") {
        collectIntlBinding(node, useIntlBindings, intlBindings, formatMessageBindings, scope);
        collectStaticStringBinding(node, staticStrings);
        collectDescriptorBinding(
          node,
          staticStrings,
          defineMessageBindings,
          defineMessagesBindings,
          descriptorValues,
          descriptorMemberValues,
          scope
        );
      }

      if (node.type === "TSEnumDeclaration") {
        collectStaticStringEnum(node, staticStrings);
      }

      if (node.type === "CallExpression") {
        const calleeBinding = scope.bindingId(node.callee);
        if (calleeBinding !== undefined && formatMessageBindings.has(calleeBinding)) {
          usages.push(
            ...usagesFromFormatMessage(
              node,
              source,
              filePath,
              staticStrings,
              descriptorValues,
              descriptorMemberValues,
              scope
            )
          );
        }
        const member = memberExpressionName(node.callee as AnyNode | undefined, scope);
        if (member?.property === "formatMessage" && intlBindings.has(member.object)) {
          usages.push(
            ...usagesFromFormatMessage(
              node,
              source,
              filePath,
              staticStrings,
              descriptorValues,
              descriptorMemberValues,
              scope
            )
          );
        }
        const directIntlCall = directUseIntlCall(node.callee as AnyNode | undefined);
        const directIntlBinding = scope.bindingId(directIntlCall?.callee);
        if (directIntlBinding !== undefined && useIntlBindings.has(directIntlBinding)) {
          usages.push(
            ...usagesFromFormatMessage(
              node,
              source,
              filePath,
              staticStrings,
              descriptorValues,
              descriptorMemberValues,
              scope
            )
          );
        }
      }

      if (node.type === "JSXElement") {
        const opening = node.openingElement as AnyNode | undefined;
        const binding = scope.bindingId(opening?.name);
        if (binding !== undefined && formattedMessageBindings.has(binding)) {
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
  useIntlBindings: Set<BindingId>,
  intlBindings: Set<BindingId>,
  formatMessageBindings: Set<BindingId>,
  scope: ReturnType<typeof createSourceScope>
) {
  const init = declarator.init as AnyNode | undefined;
  const calleeBinding = scope.bindingId(init?.callee);
  if (
    !init ||
    init.type !== "CallExpression" ||
    calleeBinding === undefined ||
    !useIntlBindings.has(calleeBinding)
  ) {
    return;
  }

  const id = declarator.id as AnyNode | undefined;
  const direct = scope.bindingId(id);
  if (direct !== undefined) {
    intlBindings.add(direct);
  }
  if (id?.type === "ObjectPattern") {
    for (const property of arrayOf<AnyNode>(id.properties)) {
      if (identifierName(property.key) === "formatMessage") {
        const local = scope.bindingId(property.value);
        if (local !== undefined) {
          formatMessageBindings.add(local);
        }
      }
    }
  }
}

function collectDescriptorBinding(
  declarator: AnyNode,
  staticStrings: StaticStringContext,
  defineMessageBindings: Set<BindingId>,
  defineMessagesBindings: Set<BindingId>,
  descriptorValues: DescriptorValues,
  descriptorMemberValues: DescriptorMemberValues,
  scope: ReturnType<typeof createSourceScope>
) {
  const binding = scope.bindingId(declarator.id);
  if (binding === undefined) {
    return;
  }

  descriptorValues.delete(binding);
  descriptorMemberValues.delete(binding);
  if (!scope.isConstant(declarator.id) || !scope.isStable(declarator.id)) {
    return;
  }

  const init = declarator.init as AnyNode | undefined;
  const values = idValuesFromDescriptor(init, staticStrings);
  if (values !== undefined) {
    descriptorValues.set(binding, values);
    return;
  }

  const calleeBinding = scope.bindingId(init?.callee);
  if (!init || init.type !== "CallExpression" || calleeBinding === undefined) {
    return;
  }

  const descriptor = arrayOf<AnyNode>(init.arguments)[0];
  if (defineMessageBindings.has(calleeBinding)) {
    const defineMessageValues = idValuesFromDescriptor(descriptor, staticStrings);
    if (defineMessageValues !== undefined) {
      descriptorValues.set(binding, defineMessageValues);
    }
    return;
  }

  if (!defineMessagesBindings.has(calleeBinding) || descriptor?.type !== "ObjectExpression") {
    return;
  }

  const members = collectDescriptorMembers(descriptor, staticStrings);
  if (members.size > 0) {
    descriptorMemberValues.set(binding, members);
  }
}

function collectDescriptorMembers(
  node: AnyNode,
  staticStrings: StaticStringContext
): Map<string, string[]> {
  const members = new Map<string, string[]>();
  for (const property of arrayOf<AnyNode>(node.properties)) {
    const key = identifierName(property.key) ?? stringLiteral(property.key);
    const values = idValuesFromDescriptor(property.value as AnyNode | undefined, staticStrings);
    if (key && values !== undefined) {
      members.set(key, values);
    }
  }

  return members;
}

function usagesFromFormatMessage(
  call: AnyNode,
  source: string,
  filePath: string,
  staticStrings: StaticStringContext,
  descriptorValues: DescriptorValues,
  descriptorMemberValues: DescriptorMemberValues,
  scope: ReturnType<typeof createSourceScope>
): SourceUsage[] {
  const descriptor = arrayOf<AnyNode>(call.arguments)[0];
  const location = nodeLocation(call, source);
  const ids = descriptorValuesFromExpression(
    descriptor,
    staticStrings,
    descriptorValues,
    descriptorMemberValues,
    scope
  );

  if (ids === undefined) {
    return [unresolvedUsage(call, descriptor, source, filePath, location, "call")];
  }

  return ids.map((id) => resolvedUsage(id, filePath, location, "call"));
}

function descriptorValuesFromExpression(
  node: AnyNode | undefined,
  staticStrings: StaticStringContext,
  descriptorValues: DescriptorValues,
  descriptorMemberValues: DescriptorMemberValues,
  scope: ReturnType<typeof createSourceScope>
): string[] | undefined {
  return (
    idValuesFromDescriptor(node, staticStrings) ??
    descriptorValues.get(scope.bindingId(node) ?? -1) ??
    descriptorMemberValuesFromExpression(node, descriptorMemberValues, scope)
  );
}

function descriptorMemberValuesFromExpression(
  node: AnyNode | undefined,
  descriptorMemberValues: DescriptorMemberValues,
  scope: ReturnType<typeof createSourceScope>
): string[] | undefined {
  const member = memberExpressionName(node, scope);
  if (!member) {
    return undefined;
  }

  return descriptorMemberValues.get(member.object)?.get(member.property);
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
  node: AnyNode | undefined,
  scope: ReturnType<typeof createSourceScope>
): { object: BindingId; property: string } | null {
  if (node?.type !== "MemberExpression") {
    return null;
  }

  const object = scope.bindingId(node.object);
  const property = identifierName(node.property) ?? stringLiteral(node.property);
  return object !== undefined && property ? { object, property } : null;
}

function directUseIntlCall(node: AnyNode | undefined): AnyNode | undefined {
  if (node?.type !== "MemberExpression" || identifierName(node.property) !== "formatMessage") {
    return undefined;
  }

  const object = node.object as AnyNode | undefined;
  return object?.type === "CallExpression" ? object : undefined;
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
