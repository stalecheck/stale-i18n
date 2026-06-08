import {
  locationFromIndex,
  type Diagnostic,
  type SourceLocation,
  type SourceUsage
} from "@stale-i18n/core";
import { arrayOf, bindingNames, identifierName, literalValue, stringLiteral, walk } from "./ast.js";
import { jsxAttributes, jsxName } from "./jsx.js";
import { rawTextDiagnostic } from "./raw-text.js";
import type { AnyNode, I18nextCheckOptions, TBinding } from "./types.js";

type StaticValues = Map<string, string[]>;
type EnumValues = Map<string, Map<string, string>>;

export function analyzeProgram(
  program: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): { usages: SourceUsage[]; diagnostics: Diagnostic[] } {
  const useTranslationNames = new Set<string>();
  const transNames = new Set<string>();
  const i18nextObjectNames = new Set<string>();
  const tBindings = new Map<string, TBinding>();
  const staticValues: StaticValues = new Map();
  const enumValues: EnumValues = new Map();
  const usages: SourceUsage[] = [];
  const diagnostics: Diagnostic[] = [];

  walk(program, {
    enter(node, _parent, state) {
      if (node.type === "ImportDeclaration" && literalValue(node.source) === "react-i18next") {
        for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
          const imported = identifierName(specifier.imported);
          const local = identifierName(specifier.local);
          if (imported === "useTranslation" && local) {
            useTranslationNames.add(local);
          }
          if (imported === "Trans" && local) {
            transNames.add(local);
          }
        }
      }

      if (node.type === "ImportDeclaration" && literalValue(node.source) === "i18next") {
        for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
          if (specifier.type === "ImportDefaultSpecifier") {
            const local = identifierName(specifier.local);
            if (local) i18nextObjectNames.add(local);
          }
          if (specifier.type === "ImportSpecifier" && identifierName(specifier.imported) === "t") {
            const local = identifierName(specifier.local);
            if (local) {
              tBindings.set(local, { namespace: options.defaultNamespace ?? "translation" });
            }
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
        collectTBinding(node, useTranslationNames, tBindings, options);
        collectStaticBinding(node, staticValues, enumValues);
      }

      if (node.type === "TSEnumDeclaration") {
        collectEnumValues(node, enumValues);
      }

      if (node.type === "CallExpression") {
        const calleeName = identifierName(node.callee);
        if (calleeName && tBindings.has(calleeName) && !state.hidden.has(calleeName)) {
          usages.push(
            ...usageFromTCall(
              node,
              tBindings.get(calleeName)!,
              source,
              filePath,
              options,
              staticValues,
              enumValues
            )
          );
        }
        const member = memberExpressionName(node.callee as AnyNode | undefined);
        if (
          member?.property === "t" &&
          i18nextObjectNames.has(member.object) &&
          !state.hidden.has(member.object)
        ) {
          usages.push(
            ...usageFromTCall(
              node,
              { namespace: options.defaultNamespace ?? "translation" },
              source,
              filePath,
              options,
              staticValues,
              enumValues
            )
          );
        }
      }

      if (node.type === "JSXElement") {
        const opening = node.openingElement as AnyNode | undefined;
        const name = jsxName(opening?.name as AnyNode | undefined);
        if (name && transNames.has(name)) {
          usages.push(
            ...usagesFromTrans(node, source, filePath, options, staticValues, enumValues)
          );
        }
      }

      if (options.rawText?.enabled === true) {
        const rawDiagnostic = rawTextDiagnostic(node, source, filePath, options);
        if (rawDiagnostic) {
          diagnostics.push(rawDiagnostic);
        }
      }

      return undefined;
    }
  });

  return { usages, diagnostics };
}

function collectTBinding(
  declarator: AnyNode,
  useTranslationNames: Set<string>,
  tBindings: Map<string, TBinding>,
  options: I18nextCheckOptions
) {
  const init = declarator.init as AnyNode | undefined;
  if (
    init?.type !== "CallExpression" ||
    !useTranslationNames.has(identifierName(init.callee) ?? "")
  ) {
    return;
  }
  const binding = bindingFromUseTranslation(init, options);
  const id = declarator.id as AnyNode | undefined;
  if (id?.type === "ObjectPattern") {
    for (const property of arrayOf<AnyNode>(id.properties)) {
      if (identifierName(property.key) === "t") {
        const local = identifierName(property.value);
        if (local) tBindings.set(local, binding);
      }
    }
  }
  if (id?.type === "ArrayPattern") {
    const first = arrayOf<AnyNode>(id.elements)[0];
    const local = identifierName(first);
    if (local) tBindings.set(local, binding);
  }
}

function bindingFromUseTranslation(call: AnyNode, options: I18nextCheckOptions): TBinding {
  const args = arrayOf<AnyNode>(call.arguments);
  const namespace =
    stringLiteral(args[0]) ??
    (args[0]?.type === "ArrayExpression"
      ? arrayOf<AnyNode>(args[0].elements)
          .map((element) => stringLiteral(element))
          .find((value): value is string => typeof value === "string")
      : undefined) ??
    options.defaultNamespace ??
    "translation";
  const optionObject = args[1];
  const keyPrefix =
    optionObject?.type === "ObjectExpression"
      ? arrayOf<AnyNode>(optionObject.properties)
          .filter((property) => identifierName(property.key) === "keyPrefix")
          .map((property) => stringLiteral(property.value as AnyNode))
          .find((value): value is string => typeof value === "string")
      : undefined;
  return { namespace, ...(keyPrefix === undefined ? {} : { keyPrefix }) };
}

function usageFromTCall(
  call: AnyNode,
  binding: TBinding,
  source: string,
  filePath: string,
  options: I18nextCheckOptions,
  staticValues: StaticValues,
  enumValues: EnumValues
): SourceUsage[] {
  const firstArg = arrayOf<AnyNode>(call.arguments)[0];
  const secondArg = arrayOf<AnyNode>(call.arguments)[1];
  const location = nodeLocation(call, source);
  if (!firstArg) {
    return [
      {
        kind: "unresolved",
        reason: "unsupported-pattern",
        filePath,
        location,
        sourceKind: "call"
      }
    ];
  }

  const keys = resolveKeyExpression(firstArg, staticValues, enumValues);

  if (keys === undefined) {
    return [
      {
        kind: "unresolved",
        raw: source.slice(firstArg.start ?? call.start ?? 0, firstArg.end ?? call.end ?? 0),
        reason: "dynamic-key",
        filePath,
        location,
        sourceKind: "call"
      }
    ];
  }

  const namespaceOverride = namespaceOverrideFromOptions(secondArg);
  if (namespaceOverride === false) {
    return [
      {
        kind: "unresolved",
        raw: source.slice(secondArg?.start ?? call.start ?? 0, secondArg?.end ?? call.end ?? 0),
        reason: "dynamic-key",
        filePath,
        location,
        sourceKind: "call"
      }
    ];
  }

  return keys.map((key) => {
    const resolved = resolveKey(key, binding, options, namespaceOverride);
    return {
      kind: "resolved",
      message: { id: resolved.key, namespace: resolved.namespace },
      filePath,
      location,
      sourceKind: "call"
    };
  });
}

function usagesFromTrans(
  element: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions,
  staticValues: StaticValues,
  enumValues: EnumValues
): SourceUsage[] {
  const attrs = jsxAttributes(element);
  const keyAttribute = jsxAttributeNode(element, "i18nKey");
  if (!keyAttribute) {
    return [];
  }

  const keys = resolveJsxAttributeValues(keyAttribute, staticValues, enumValues);
  if (keys === undefined) {
    return [
      {
        kind: "unresolved",
        raw: source.slice(
          keyAttribute.start ?? element.start ?? 0,
          keyAttribute.end ?? element.end ?? 0
        ),
        reason: "dynamic-key",
        filePath,
        location: nodeLocation(element, source),
        sourceKind: "jsx-component"
      }
    ];
  }

  return keys.map((key) => ({
    kind: "resolved",
    message: {
      id: key,
      namespace: attrs.get("ns") ?? options.defaultNamespace ?? "translation"
    },
    filePath,
    location: nodeLocation(element, source),
    sourceKind: "jsx-component"
  }));
}

function resolveKey(
  rawKey: string,
  binding: TBinding,
  options: I18nextCheckOptions,
  namespaceOverride: string | undefined
): { namespace: string; key: string } {
  const namespaceSeparator =
    options.namespaceSeparator === false ? false : (options.namespaceSeparator ?? ":");
  if (namespaceSeparator !== false && rawKey.includes(namespaceSeparator)) {
    const [namespace, ...rest] = rawKey.split(namespaceSeparator);
    return { namespace: namespace!, key: rest.join(namespaceSeparator) };
  }
  return {
    namespace: namespaceOverride ?? binding.namespace,
    key: binding.keyPrefix ? `${binding.keyPrefix}.${rawKey}` : rawKey
  };
}

function namespaceOverrideFromOptions(node: AnyNode | undefined): string | false | undefined {
  if (!node || node.type !== "ObjectExpression") {
    return undefined;
  }
  const nsProperty = arrayOf<AnyNode>(node.properties).find(
    (property) => identifierName(property.key) === "ns"
  );
  if (!nsProperty) {
    return undefined;
  }
  return stringLiteral(nsProperty.value as AnyNode) ?? false;
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

function nodeLocation(node: AnyNode, source: string): SourceLocation {
  return locationFromIndex(source, node.start ?? 0);
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

  const values = resolveKeyExpression(
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

function collectEnumValues(node: AnyNode, enumValues: EnumValues) {
  const enumName = identifierName(node.id);
  if (!enumName) {
    return;
  }

  const members = new Map<string, string>();
  const body = node.body as AnyNode | undefined;
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

function resolveKeyExpression(
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

  if (node.type === "ArrayExpression") {
    return resolveArrayValues(node, staticValues, enumValues);
  }

  if (node.type === "ConditionalExpression") {
    const consequent = resolveKeyExpression(
      node.consequent as AnyNode | undefined,
      staticValues,
      enumValues
    );
    const alternate = resolveKeyExpression(
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

function resolveArrayValues(
  node: AnyNode,
  staticValues: StaticValues,
  enumValues: EnumValues
): string[] | undefined {
  const values: string[] = [];
  for (const element of arrayOf<AnyNode>(node.elements)) {
    const elementValues = resolveKeyExpression(element, staticValues, enumValues);
    if (elementValues === undefined) {
      return undefined;
    }
    values.push(...elementValues);
  }
  return unique(values);
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
    const expressionValues = resolveKeyExpression(expression, staticValues, enumValues);
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
    return resolveKeyExpression(value.expression as AnyNode | undefined, staticValues, enumValues);
  }

  return resolveKeyExpression(value, staticValues, enumValues);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
