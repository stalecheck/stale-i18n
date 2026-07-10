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
  walk,
  type Diagnostic,
  type BindingId,
  type SourceLocation,
  type StaticStringContext
} from "@stale-i18n/core";
import {
  appendTranslationKeySuffix,
  displayTranslationKey,
  normalizeKeySeparator,
  parseTranslationKey,
  prependTranslationKey
} from "./key-path.js";
import { rawUiTextDiagnostic } from "./raw-text.js";
import type {
  AnyNode,
  I18nextCheckOptions,
  I18nextSourceUsage,
  PluralUsage,
  TBinding,
  TranslationKey
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
        collectTBinding(
          node,
          useTranslationBindings,
          tBindings,
          tObjectBindings,
          options,
          scope,
          staticStrings
        );
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
                namespace: [options.defaultNamespace ?? "translation"]
              },
              source,
              filePath,
              options,
              staticStrings
            )
          );
        }
        const directHookCall = directUseTranslationCall(node.callee as AnyNode | undefined);
        const directHookBinding = scope.bindingId(directHookCall?.callee);
        if (
          directHookCall &&
          directHookBinding !== undefined &&
          useTranslationBindings.has(directHookBinding)
        ) {
          usages.push(
            ...usageFromTCall(
              node,
              bindingFromUseTranslation(directHookCall, options, staticStrings),
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
          tBindings.set(local, { namespace: [options.defaultNamespace ?? "translation"] });
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
  scope: ReturnType<typeof createSourceScope>,
  staticStrings: StaticStringContext
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
  const binding = bindingFromUseTranslation(init, options, staticStrings);
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

function bindingFromUseTranslation(
  call: AnyNode,
  options: I18nextCheckOptions,
  staticStrings: StaticStringContext
): TBinding {
  const args = arrayOf<AnyNode>(call.arguments);
  const namespaceNode = args[0];
  const namespace =
    namespaceNode === undefined
      ? [options.defaultNamespace ?? "translation"]
      : namespaceNode.type === "ArrayExpression"
        ? resolveStaticStrings(arrayOf<AnyNode>(namespaceNode.elements)[0], staticStrings)
        : resolveStaticStrings(namespaceNode, staticStrings);
  const optionObject = args[1];
  const keyPrefixNode = objectPropertyValue(optionObject, "keyPrefix");
  const keyPrefix =
    keyPrefixNode === undefined ? undefined : resolveStaticStrings(keyPrefixNode, staticStrings);
  return {
    ...(namespace === undefined ? {} : { namespace }),
    ...(namespaceNode !== undefined && namespace === undefined
      ? { unresolvedNamespace: true }
      : {}),
    ...(keyPrefix === undefined ? {} : { keyPrefix }),
    ...(keyPrefixNode !== undefined && keyPrefix === undefined ? { unresolvedKeyPrefix: true } : {})
  };
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

  const namespaceOverride = namespaceOverrideFromOptions(secondArg, staticStrings);
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

  const variant = keyVariantFromOptions(secondArg, staticStrings);
  if (variant.unresolved)
    return unresolvedUsage(secondArg ?? call, call, source, filePath, location, "call");
  const keySeparator = normalizeKeySeparator(options.keySeparator);

  const usages: I18nextSourceUsage[] = [];
  for (const key of keys) {
    const resolved = resolveKey(key, binding, options, namespaceOverride);
    if (resolved === undefined)
      return unresolvedUsage(call, call, source, filePath, location, "call");
    for (const target of resolved) {
      for (const context of variant.contexts ?? [undefined]) {
        const translationKey = variant.plural ? target.key : applyContext(target.key, context);
        usages.push({
          kind: "resolved",
          keyPath: translationKey,
          message: messageFromTranslationKey(translationKey, target.namespace, keySeparator),
          ...(variant.plural === undefined
            ? {}
            : {
                plural: {
                  ...(context === undefined ? {} : { context }),
                  ordinal: variant.plural.ordinal
                }
              }),
          filePath,
          location,
          sourceKind: "call"
        });
      }
    }
  }
  return usages;
}

function usagesFromTrans(
  element: AnyNode,
  source: string,
  filePath: string,
  options: I18nextCheckOptions,
  staticStrings: StaticStringContext
): I18nextSourceUsage[] {
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
  const optionVariant = keyVariantFromOptions(tOptions, staticStrings);
  const contextAttribute = jsxAttributeNode(element, "context");
  const contexts = contextAttribute
    ? resolveJsxAttributeValues(contextAttribute, staticStrings)
    : (optionVariant.contexts ?? [undefined]);
  const namespaceAttribute = jsxAttributeNode(element, "ns");
  const namespaces = namespaceAttribute
    ? resolveJsxAttributeValues(namespaceAttribute, staticStrings)
    : [options.defaultNamespace ?? "translation"];
  if (optionVariant.unresolved || contexts === undefined || namespaces === undefined) {
    return unresolvedUsage(
      element,
      element,
      source,
      filePath,
      nodeLocation(element, source),
      "jsx-component"
    );
  }
  const hasCount = jsxAttributeNode(element, "count") !== undefined;
  const plural = hasCount
    ? { ordinal: optionVariant.plural?.ordinal ?? ordinalFromOptions(tOptions) }
    : optionVariant.plural;
  const keySeparator = normalizeKeySeparator(options.keySeparator);

  return keys.flatMap((key) =>
    namespaces.flatMap((namespace) =>
      contexts.map((context) => {
        const parsedKey = parseTranslationKey(key, keySeparator);
        const translationKey = plural ? parsedKey : applyContext(parsedKey, context);
        return {
          kind: "resolved",
          keyPath: translationKey,
          message: messageFromTranslationKey(translationKey, namespace, keySeparator),
          ...(plural === undefined
            ? {}
            : {
                plural: { ...(context === undefined ? {} : { context }), ordinal: plural.ordinal }
              }),
          filePath,
          location: nodeLocation(element, source),
          sourceKind: "jsx-component"
        };
      })
    )
  );
}

function resolveKey(
  rawKey: string,
  binding: TBinding,
  options: I18nextCheckOptions,
  namespaceOverride: string[] | undefined
): Array<{ namespace: string; key: TranslationKey }> | undefined {
  const namespaceSeparator =
    options.namespaceSeparator === false ? false : (options.namespaceSeparator ?? ":");
  const keySeparator = normalizeKeySeparator(options.keySeparator);
  if (namespaceSeparator !== false && rawKey.includes(namespaceSeparator)) {
    const [namespace, ...rest] = rawKey.split(namespaceSeparator);
    return [
      {
        namespace: namespace!,
        key: parseTranslationKey(rest.join(namespaceSeparator), keySeparator)
      }
    ];
  }
  const namespaces = namespaceOverride ?? binding.namespace;
  if (
    namespaces === undefined ||
    binding.unresolvedKeyPrefix ||
    (namespaceOverride === undefined && binding.unresolvedNamespace)
  ) {
    return undefined;
  }
  const prefixes = binding.keyPrefix ?? [undefined];
  return namespaces.flatMap((namespace) =>
    prefixes.map((keyPrefix) => ({
      namespace,
      key: prependTranslationKey(keyPrefix, rawKey, keySeparator)
    }))
  );
}

function namespaceOverrideFromOptions(
  node: AnyNode | undefined,
  staticStrings: StaticStringContext
): string[] | false | undefined {
  if (!node || node.type !== "ObjectExpression") {
    return undefined;
  }
  const nsProperty = arrayOf<AnyNode>(node.properties).find(
    (property) => identifierName(property.key) === "ns"
  );
  if (!nsProperty) {
    return undefined;
  }
  return resolveStaticStrings(nsProperty.value as AnyNode, staticStrings) ?? false;
}

type KeyVariant = {
  contexts?: string[];
  plural?: PluralUsage;
  unresolved?: boolean;
};

function keyVariantFromOptions(
  node: AnyNode | undefined,
  staticStrings: StaticStringContext
): KeyVariant {
  if (!node || node.type !== "ObjectExpression") {
    return {};
  }

  const properties = arrayOf<AnyNode>(node.properties);
  const hasCount = properties.some((property) => identifierName(property.key) === "count");
  const contextNode = objectPropertyValue(node, "context");
  const contexts =
    contextNode === undefined ? undefined : resolveStaticStrings(contextNode, staticStrings);
  if (contextNode !== undefined && contexts === undefined) return { unresolved: true };

  if (hasCount) {
    const ordinal = ordinalFromOptions(node);
    return {
      ...(contexts === undefined ? {} : { contexts }),
      plural: { ordinal }
    };
  }

  return { ...(contexts === undefined ? {} : { contexts }) };
}

function objectPropertyValue(node: AnyNode | undefined, name: string): AnyNode | undefined {
  if (node?.type !== "ObjectExpression") return undefined;
  return arrayOf<AnyNode>(node.properties).find((property) => identifierName(property.key) === name)
    ?.value as AnyNode | undefined;
}

function unresolvedUsage(
  rawNode: AnyNode,
  call: AnyNode,
  source: string,
  filePath: string,
  location: SourceLocation,
  sourceKind: "call" | "jsx-component"
): I18nextSourceUsage[] {
  return [
    {
      kind: "unresolved",
      raw: source.slice(rawNode.start ?? call.start ?? 0, rawNode.end ?? call.end ?? 0),
      reason: "dynamic-key",
      filePath,
      location,
      sourceKind
    }
  ];
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

function applyContext(key: TranslationKey, context: string | undefined): TranslationKey {
  return context === undefined ? key : appendTranslationKeySuffix(key, `_${context}`);
}

function messageFromTranslationKey(
  key: TranslationKey,
  namespace: string,
  separator: ReturnType<typeof normalizeKeySeparator>
) {
  return {
    id: displayTranslationKey(key, separator),
    namespace
  };
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

function directUseTranslationCall(node: AnyNode | undefined): AnyNode | undefined {
  if (node?.type !== "MemberExpression" || identifierName(node.property) !== "t") {
    return undefined;
  }

  const object = node.object as AnyNode | undefined;
  return object?.type === "CallExpression" ? object : undefined;
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
