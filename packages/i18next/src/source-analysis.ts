import {
  arrayOf,
  collectStaticStringBinding,
  collectStaticStringEnum,
  createSourceScope,
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
  type BindingId,
  type SourceLocation,
  type StaticStringContext
} from "@stale-i18n/core";
import { jsxAttributes } from "./jsx.js";
import { rawUiTextDiagnostic } from "./raw-text.js";
import type {
  AnyNode,
  I18nextCheckOptions,
  I18nextSourceUsage,
  PluralUsage,
  TBinding
} from "./types.js";

export function analyzeProgram(
  program: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions
): { usages: I18nextSourceUsage[]; diagnostics: Diagnostic[] } {
  const scope = createSourceScope(program);
  const useTranslationBindings = new Set<BindingId>();
  const transBindings = new Set<BindingId>();
  const i18nextObjectBindings = new Set<BindingId>();
  const tBindings = new Map<BindingId, TBinding>();
  const tObjectBindings = new Map<BindingId, TBinding>();
  const staticStrings = createStaticStringContext(scope);
  const usages: I18nextSourceUsage[] = [];
  const diagnostics: Diagnostic[] = [];

  walk(program, {
    enter(node) {
      collectImportedBindings(
        node,
        scope,
        options,
        useTranslationBindings,
        transBindings,
        i18nextObjectBindings,
        tBindings
      );
      return undefined;
    }
  });

  walk(program, {
    enter(node) {
      if (node.type === "VariableDeclarator") {
        collectTBinding(node, useTranslationBindings, tBindings, tObjectBindings, options, scope);
        collectStaticStringBinding(node, staticStrings);
      } else if (node.type === "TSEnumDeclaration") {
        collectStaticStringEnum(node, staticStrings);
      }
      return undefined;
    }
  });

  walk(program, {
    enter(node) {
      if (node.type === "CallExpression") {
        const calleeBinding = scope.bindingId(node.callee);
        if (calleeBinding !== undefined && tBindings.has(calleeBinding)) {
          usages.push(
            ...usageFromTCall(
              node,
              tBindings.get(calleeBinding)!,
              source,
              filePath,
              options,
              staticStrings
            )
          );
        }
        const member = memberExpressionName(node.callee as AnyNode | undefined, scope);
        if (
          member?.property === "t" &&
          (i18nextObjectBindings.has(member.object) || tObjectBindings.has(member.object))
        ) {
          usages.push(
            ...usageFromTCall(
              node,
              tObjectBindings.get(member.object) ?? {
                namespace: options.defaultNamespace ?? "translation"
              },
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
        const binding = scope.bindingId(opening?.name);
        if (binding !== undefined && transBindings.has(binding)) {
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

function collectImportedBindings(
  node: AnyNode,
  scope: ReturnType<typeof createSourceScope>,
  options: I18nextCheckOptions,
  useTranslationBindings: Set<BindingId>,
  transBindings: Set<BindingId>,
  i18nextObjectBindings: Set<BindingId>,
  tBindings: Map<BindingId, TBinding>
) {
  if (node.type === "ImportDeclaration" && literalValue(node.source) === "react-i18next") {
    for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
      const imported = identifierName(specifier.imported);
      const local = scope.bindingId(specifier.local);
      if (imported === "useTranslation" && local !== undefined) {
        useTranslationBindings.add(local);
      }
      if (imported === "Trans" && local !== undefined) {
        transBindings.add(local);
      }
    }
  }

  if (node.type === "ImportDeclaration" && literalValue(node.source) === "i18next") {
    for (const specifier of arrayOf<AnyNode>(node.specifiers)) {
      if (specifier.type === "ImportDefaultSpecifier") {
        const local = scope.bindingId(specifier.local);
        if (local !== undefined) i18nextObjectBindings.add(local);
      }
      if (specifier.type === "ImportSpecifier" && identifierName(specifier.imported) === "t") {
        const local = scope.bindingId(specifier.local);
        if (local !== undefined) {
          tBindings.set(local, { namespace: options.defaultNamespace ?? "translation" });
        }
      }
    }
  }
}

function isJsxMode(options: I18nextCheckOptions): boolean {
  return (options.mode ?? "jsx") === "jsx";
}

function collectTBinding(
  declarator: AnyNode,
  useTranslationBindings: Set<BindingId>,
  tBindings: Map<BindingId, TBinding>,
  tObjectBindings: Map<BindingId, TBinding>,
  options: I18nextCheckOptions,
  scope: ReturnType<typeof createSourceScope>
) {
  const init = declarator.init as AnyNode | undefined;
  const calleeBinding = scope.bindingId(init?.callee);
  if (
    init?.type !== "CallExpression" ||
    calleeBinding === undefined ||
    !useTranslationBindings.has(calleeBinding)
  ) {
    return;
  }
  const binding = bindingFromUseTranslation(init, options);
  const id = declarator.id as AnyNode | undefined;
  const direct = scope.bindingId(id);
  if (direct !== undefined) {
    tObjectBindings.set(direct, binding);
  }
  if (id?.type === "ObjectPattern") {
    for (const property of arrayOf<AnyNode>(id.properties)) {
      if (identifierName(property.key) === "t") {
        const local = scope.bindingId(property.value);
        if (local !== undefined) tBindings.set(local, binding);
      }
    }
  }
  if (id?.type === "ArrayPattern") {
    const first = arrayOf<AnyNode>(id.elements)[0];
    const local = scope.bindingId(first);
    if (local !== undefined) tBindings.set(local, binding);
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
): I18nextSourceUsage[] {
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

  const variant = keyVariantFromOptions(secondArg);

  return keys.map((key) => {
    const resolved = resolveKey(key, binding, options, namespaceOverride);
    return {
      kind: "resolved" as const,
      message: {
        id: variant.plural ? resolved.key : applyContext(resolved.key, variant.context),
        namespace: resolved.namespace
      },
      ...(variant.plural === undefined ? {} : { plural: variant.plural }),
      filePath,
      location,
      sourceKind: "call" as const
    };
  });
}

function usagesFromTrans(
  element: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions,
  staticStrings: StaticStringContext
): I18nextSourceUsage[] {
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

  const tOptions = jsxObjectAttributeNode(element, "tOptions");
  const optionVariant = keyVariantFromOptions(tOptions);
  const hasCount = jsxAttributeNode(element, "count") !== undefined;
  const context = attrs.get("context") ?? optionVariant.context;
  const plural = hasCount
    ? {
        ...(context === undefined ? {} : { context }),
        ordinal: optionVariant.plural?.ordinal ?? ordinalFromOptions(tOptions)
      }
    : optionVariant.plural;

  return keys.map((key) => {
    const id = plural ? key : applyContext(key, context);
    return {
      kind: "resolved",
      message: {
        id,
        namespace: attrs.get("ns") ?? options.defaultNamespace ?? "translation"
      },
      ...(plural === undefined ? {} : { plural }),
      filePath,
      location: nodeLocation(element, source),
      sourceKind: "jsx-component"
    };
  });
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
  return stringLiteral(nsProperty.value) ?? false;
}

type KeyVariant = {
  context?: string | undefined;
  plural?: PluralUsage;
};

function keyVariantFromOptions(node: AnyNode | undefined): KeyVariant {
  if (!node || node.type !== "ObjectExpression") {
    return {};
  }

  const properties = arrayOf<AnyNode>(node.properties);
  const hasCount = properties.some((property) => identifierName(property.key) === "count");
  const context = properties
    .filter((property) => identifierName(property.key) === "context")
    .map((property) => stringLiteral(property.value as AnyNode))
    .find((value): value is string => typeof value === "string");

  if (hasCount) {
    const ordinal = ordinalFromOptions(node);
    return {
      ...(context === undefined ? {} : { context }),
      plural: { ...(context === undefined ? {} : { context }), ordinal }
    };
  }

  return { ...(context === undefined ? {} : { context }) };
}

function ordinalFromOptions(node: AnyNode | undefined): boolean {
  if (node?.type !== "ObjectExpression") {
    return false;
  }
  return arrayOf<AnyNode>(node.properties).some(
    (property) =>
      identifierName(property.key) === "ordinal" && literalValue(property.value) === true
  );
}

function applyContext(key: string, context: string | undefined) {
  return context === undefined ? key : `${key}_${context}`;
}

function memberExpressionName(
  node: AnyNode | undefined,
  scope: ReturnType<typeof createSourceScope>
): { object: BindingId; property: string } | null {
  if (node?.type !== "MemberExpression") {
    return null;
  }
  const object = scope.bindingId(node.object);
  const property = identifierName(node.property);
  return object !== undefined && property ? { object, property } : null;
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

function jsxObjectAttributeNode(element: AnyNode, name: string): AnyNode | undefined {
  const attribute = jsxAttributeNode(element, name);
  const value = attribute?.value as AnyNode | undefined;
  if (value?.type !== "JSXExpressionContainer") {
    return undefined;
  }
  const expression = value.expression as AnyNode | undefined;
  return expression?.type === "ObjectExpression" ? expression : undefined;
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
