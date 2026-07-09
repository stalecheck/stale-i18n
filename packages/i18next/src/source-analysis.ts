import {
  arrayOf,
  bindingNames,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createStaticStringContext,
  getRuleLevel,
  identifierName,
  jsxName,
  literalValue,
  locationFromIndex,
  resolveStaticStrings,
  stringLiteral,
  walk,
  type Diagnostic,
  type SourceLocation,
  type SourceUsage,
  type StaticStringContext
} from "@stale-i18n/core";
import { jsxAttributes } from "./jsx.js";
import { rawUiTextDiagnostic } from "./raw-text.js";
import type { AnyNode, I18nextCheckOptions, TBinding } from "./types.js";

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
  const staticStrings = createStaticStringContext();
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
        collectStaticStringBinding(node, staticStrings);
      }

      if (node.type === "TSEnumDeclaration") {
        collectStaticStringEnum(node, staticStrings);
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
              staticStrings
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
              staticStrings
            )
          );
        }
      }

      if (isJsxMode(options) && node.type === "JSXElement") {
        const opening = node.openingElement as AnyNode | undefined;
        const name = jsxName(opening?.name as AnyNode | undefined);
        if (name && transNames.has(name)) {
          usages.push(...usagesFromTrans(node, source, filePath, options, staticStrings));
        }
      }

      if (isJsxMode(options) && getRuleLevel("raw-ui-text", options.rules) !== "off") {
        const rawDiagnostic = rawUiTextDiagnostic(node, source, filePath, options);
        if (rawDiagnostic) {
          diagnostics.push(rawDiagnostic);
        }
      }

      return undefined;
    }
  });

  return { usages, diagnostics };
}

function isJsxMode(options: I18nextCheckOptions): boolean {
  return (options.mode ?? "jsx") === "jsx";
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
  staticStrings: StaticStringContext
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

  const keys = resolveStaticStrings(firstArg, staticStrings);

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

  const variants = keyVariantsFromOptions(secondArg);

  return keys.flatMap((key) => {
    const resolved = resolveKey(key, binding, options, namespaceOverride);
    return variants.map((variant) => ({
      kind: "resolved" as const,
      message: { id: applyKeyVariant(resolved.key, variant), namespace: resolved.namespace },
      filePath,
      location,
      sourceKind: "call" as const
    }));
  });
}

function usagesFromTrans(
  element: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions,
  staticStrings: StaticStringContext
): SourceUsage[] {
  const attrs = jsxAttributes(element);
  const keyAttribute = jsxAttributeNode(element, "i18nKey");
  if (!keyAttribute) {
    return [];
  }

  const keys = resolveJsxAttributeValues(keyAttribute, staticStrings);
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

type KeyVariant = {
  context?: string | undefined;
  pluralSuffix?: string | undefined;
};

function keyVariantsFromOptions(node: AnyNode | undefined): KeyVariant[] {
  if (!node || node.type !== "ObjectExpression") {
    return [{}];
  }

  const properties = arrayOf<AnyNode>(node.properties);
  const hasCount = properties.some((property) => identifierName(property.key) === "count");
  const context = properties
    .filter((property) => identifierName(property.key) === "context")
    .map((property) => stringLiteral(property.value as AnyNode))
    .find((value): value is string => typeof value === "string");

  if (hasCount) {
    return ["one", "other"].map((plural) => ({
      ...(context === undefined ? {} : { context }),
      pluralSuffix: plural
    }));
  }

  return [
    {
      ...(context === undefined ? {} : { context })
    }
  ];
}

function applyKeyVariant(key: string, variant: KeyVariant) {
  const contextSuffix = variant.context === undefined ? "" : `_${variant.context}`;
  const pluralSuffix = variant.pluralSuffix === undefined ? "" : `_${variant.pluralSuffix}`;
  return `${key}${contextSuffix}${pluralSuffix}`;
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
