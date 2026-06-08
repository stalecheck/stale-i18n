import { locationFromIndex, type SourceLocation, type SourceUsage } from "@stale-i18n/core";
import { arrayOf, bindingNames, identifierName, jsxName, stringLiteral, walk } from "./ast.js";
import type { AnyNode } from "./types.js";

type StaticValues = Map<string, string[]>;
type DescriptorValues = Map<string, string[]>;
type EnumValues = Map<string, Map<string, string>>;

export function analyzeProgram(program: AnyNode, source: string, filePath: string): SourceUsage[] {
  const useIntlNames = new Set<string>();
  const formattedMessageNames = new Set<string>();
  const intlBindings = new Set<string>();
  const staticValues: StaticValues = new Map();
  const enumValues: EnumValues = new Map();
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

      if (node.type === "VariableDeclarator") {
        collectIntlBinding(node, useIntlNames, intlBindings);
        collectStaticBinding(node, staticValues, enumValues);
        collectDescriptorBinding(node, staticValues, enumValues, descriptorValues);
      }

      if (node.type === "TSEnumDeclaration") {
        collectEnumValues(node, enumValues);
      }

      if (node.type === "CallExpression") {
        const member = memberExpressionName(node.callee as AnyNode | undefined);
        if (
          member?.property === "formatMessage" &&
          intlBindings.has(member.object) &&
          !state.hidden.has(member.object)
        ) {
          usages.push(
            ...usagesFromFormatMessage(
              node,
              source,
              filePath,
              staticValues,
              enumValues,
              descriptorValues
            )
          );
        }
      }

      if (node.type === "JSXElement") {
        const opening = node.openingElement as AnyNode | undefined;
        const name = jsxName(opening?.name as AnyNode | undefined);
        if (name && formattedMessageNames.has(name)) {
          usages.push(
            ...usagesFromFormattedMessage(node, source, filePath, staticValues, enumValues)
          );
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
  intlBindings: Set<string>
) {
  const id = identifierName(declarator.id);
  const init = declarator.init as AnyNode | undefined;
  if (
    id &&
    init?.type === "CallExpression" &&
    useIntlNames.has(identifierName(init.callee) ?? "")
  ) {
    intlBindings.add(id);
  }
}

function collectStaticBinding(
  declarator: AnyNode,
  staticValues: StaticValues,
  enumValues: EnumValues
) {
  const name = identifierName(declarator.id);
  if (!name) {
    return;
  }

  const values = resolveStringExpression(
    declarator.init as AnyNode | undefined,
    staticValues,
    enumValues
  );
  if (values === undefined) {
    staticValues.delete(name);
    return;
  }

  staticValues.set(name, values);
}

function collectDescriptorBinding(
  declarator: AnyNode,
  staticValues: StaticValues,
  enumValues: EnumValues,
  descriptorValues: DescriptorValues
) {
  const name = identifierName(declarator.id);
  if (!name) {
    return;
  }

  const values = idValuesFromDescriptor(
    declarator.init as AnyNode | undefined,
    staticValues,
    enumValues
  );
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
  staticValues: StaticValues,
  enumValues: EnumValues,
  descriptorValues: DescriptorValues
): SourceUsage[] {
  const descriptor = arrayOf<AnyNode>(call.arguments)[0];
  const location = nodeLocation(call, source);
  const ids =
    idValuesFromDescriptor(descriptor, staticValues, enumValues) ??
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
  staticValues: StaticValues,
  enumValues: EnumValues
): SourceUsage[] {
  const attribute = jsxAttributeNode(element, "id");
  const location = nodeLocation(element, source);
  if (!attribute) {
    return [];
  }

  const ids = resolveJsxAttributeValues(attribute, staticValues, enumValues);
  if (ids === undefined) {
    return [unresolvedUsage(element, attribute, source, filePath, location, "jsx-component")];
  }

  return ids.map((id) => resolvedUsage(id, filePath, location, "jsx-component"));
}

function idValuesFromDescriptor(
  node: AnyNode | undefined,
  staticValues: StaticValues,
  enumValues: EnumValues
): string[] | undefined {
  if (!node || node.type !== "ObjectExpression") {
    return undefined;
  }

  const idProperty = arrayOf<AnyNode>(node.properties).find(
    (property) => identifierName(property.key) === "id"
  );
  return resolveStringExpression(
    idProperty?.value as AnyNode | undefined,
    staticValues,
    enumValues
  );
}

function resolveStringExpression(
  node: AnyNode | undefined,
  staticValues: StaticValues,
  enumValues: EnumValues
): string[] | undefined {
  if (!node) {
    return undefined;
  }

  const literal = stringLiteral(node);
  if (literal !== undefined) {
    return [literal];
  }

  if (node.type === "Identifier") {
    return staticValues.get(identifierName(node) ?? "");
  }

  if (node.type === "ConditionalExpression") {
    const consequent = resolveStringExpression(
      node.consequent as AnyNode | undefined,
      staticValues,
      enumValues
    );
    const alternate = resolveStringExpression(
      node.alternate as AnyNode | undefined,
      staticValues,
      enumValues
    );
    return consequent && alternate ? unique([...consequent, ...alternate]) : undefined;
  }

  if (node.type === "TemplateLiteral") {
    return resolveTemplateValues(node, staticValues, enumValues);
  }

  if (node.type === "MemberExpression") {
    return resolveMemberExpressionValues(node, enumValues);
  }

  return undefined;
}

function jsxAttributeNode(element: AnyNode, name: string): AnyNode | undefined {
  const opening = element.openingElement as AnyNode | undefined;
  return arrayOf<AnyNode>(opening?.attributes).find(
    (attribute) => jsxName(attribute.name as AnyNode | undefined) === name
  );
}

function resolveJsxAttributeValues(
  attribute: AnyNode,
  staticValues: StaticValues,
  enumValues: EnumValues
): string[] | undefined {
  const value = attribute.value as AnyNode | undefined;
  if (!value) {
    return undefined;
  }

  if (value.type === "JSXExpressionContainer") {
    return resolveStringExpression(
      value.expression as AnyNode | undefined,
      staticValues,
      enumValues
    );
  }

  return resolveStringExpression(value, staticValues, enumValues);
}

function collectEnumValues(node: AnyNode, enumValues: EnumValues) {
  const enumName = identifierName(node.id);
  if (!enumName) {
    return;
  }

  const body = node.body as AnyNode | undefined;
  const members = new Map<string, string>();
  for (const member of arrayOf<AnyNode>(body?.members ?? node.members)) {
    const memberName = identifierName(member.id) ?? stringLiteral(member.id);
    const value = stringLiteral(member.initializer) ?? stringLiteral(member.init);
    if (memberName && value !== undefined) {
      members.set(memberName, value);
    }
  }

  if (members.size > 0) {
    enumValues.set(enumName, members);
  }
}

function resolveTemplateValues(
  node: AnyNode,
  staticValues: StaticValues,
  enumValues: EnumValues
): string[] | undefined {
  const quasis = arrayOf<AnyNode>(node.quasis);
  const expressions = arrayOf<AnyNode>(node.expressions);
  let values = [templateQuasiValue(quasis[0]) ?? ""];

  for (const [index, expression] of expressions.entries()) {
    const expressionValues = resolveStringExpression(expression, staticValues, enumValues);
    const nextQuasi = templateQuasiValue(quasis[index + 1]) ?? "";
    if (expressionValues === undefined) {
      return undefined;
    }

    values = values.flatMap((value) =>
      expressionValues.map((expressionValue) => `${value}${expressionValue}${nextQuasi}`)
    );
  }

  return unique(values);
}

function templateQuasiValue(node: AnyNode | undefined): string | undefined {
  const value = node?.value as { cooked?: unknown; raw?: unknown } | undefined;
  if (typeof value?.cooked === "string") {
    return value.cooked;
  }
  if (typeof value?.raw === "string") {
    return value.raw;
  }
  return undefined;
}

function resolveMemberExpressionValues(
  node: AnyNode,
  enumValues: EnumValues
): string[] | undefined {
  const object = identifierName(node.object);
  const property = identifierName(node.property) ?? stringLiteral(node.property);
  if (!object || !property) {
    return undefined;
  }

  const value = enumValues.get(object)?.get(property);
  return value === undefined ? undefined : [value];
}

function unique(values: string[]) {
  return [...new Set(values)];
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
