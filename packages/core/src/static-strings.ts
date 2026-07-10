import { arrayOf, identifierName, stringLiteral } from "./ast.js";
import type { AnyNode } from "./types.js";
import type { BindingId, SourceScope } from "./scope.js";

export type StaticStringContext = {
  values: Map<string, string[]>;
  enums: Map<string, Map<string, string>>;
  scope?: SourceScope;
  scopedValues: Map<BindingId, string[]>;
  scopedEnums: Map<BindingId, Map<string, string>>;
};

export function createStaticStringContext(scope?: SourceScope): StaticStringContext {
  return {
    values: new Map(),
    enums: new Map(),
    ...(scope === undefined ? {} : { scope }),
    scopedValues: new Map(),
    scopedEnums: new Map()
  };
}

export function collectStaticStringBinding(declarator: AnyNode, context: StaticStringContext) {
  const name = identifierName(declarator.id);
  if (!name) {
    return;
  }

  const binding = context.scope?.bindingId(declarator.id);
  if (
    binding !== undefined &&
    (!context.scope?.isConstant(declarator.id) || !context.scope.isStable(declarator.id))
  ) {
    context.scopedValues.delete(binding);
    return;
  }

  const values = resolveStaticStrings(declarator.init as AnyNode | undefined, context);
  if (values === undefined) {
    if (binding === undefined) context.values.delete(name);
    else context.scopedValues.delete(binding);
    return;
  }

  if (binding === undefined) context.values.set(name, values);
  else context.scopedValues.set(binding, values);
}

export function collectStaticStringEnum(node: AnyNode, context: StaticStringContext) {
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
    const binding = context.scope?.bindingId(node.id);
    if (binding === undefined) context.enums.set(enumName, members);
    else context.scopedEnums.set(binding, members);
  }
}

export function resolveStaticStrings(
  node: AnyNode | undefined,
  context: StaticStringContext
): string[] | undefined {
  if (!node) {
    return undefined;
  }

  const literal = stringLiteral(node);
  if (literal !== undefined) {
    return [literal];
  }

  if (node.type === "Identifier") {
    const binding = context.scope?.bindingId(node);
    return binding === undefined
      ? context.values.get(identifierName(node) ?? "")
      : context.scopedValues.get(binding);
  }

  if (node.type === "ArrayExpression") {
    return resolveArrayValues(node, context);
  }

  if (node.type === "ConditionalExpression") {
    const consequent = resolveStaticStrings(node.consequent as AnyNode | undefined, context);
    const alternate = resolveStaticStrings(node.alternate as AnyNode | undefined, context);
    return consequent && alternate ? unique([...consequent, ...alternate]) : undefined;
  }

  if (node.type === "TemplateLiteral") {
    return resolveTemplateValues(node, context);
  }

  if (node.type === "MemberExpression") {
    return resolveMemberExpressionValues(node, context);
  }

  return undefined;
}

function resolveArrayValues(node: AnyNode, context: StaticStringContext): string[] | undefined {
  const values: string[] = [];
  for (const element of arrayOf<AnyNode>(node.elements)) {
    const elementValues = resolveStaticStrings(element, context);
    if (elementValues === undefined) {
      return undefined;
    }
    values.push(...elementValues);
  }
  return unique(values);
}

function resolveTemplateValues(node: AnyNode, context: StaticStringContext): string[] | undefined {
  const quasis = arrayOf<AnyNode>(node.quasis);
  const expressions = arrayOf<AnyNode>(node.expressions);
  let values = [templateQuasiValue(quasis[0]) ?? ""];

  for (const [index, expression] of expressions.entries()) {
    const expressionValues = resolveStaticStrings(expression, context);
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
  context: StaticStringContext
): string[] | undefined {
  const objectNode = node.object as AnyNode | undefined;
  const object = identifierName(objectNode);
  const property = identifierName(node.property) ?? stringLiteral(node.property);
  if (!object || !property) {
    return undefined;
  }

  const binding = context.scope?.bindingId(objectNode);
  const value =
    binding === undefined
      ? context.enums.get(object)?.get(property)
      : context.scopedEnums.get(binding)?.get(property);
  return value === undefined ? undefined : [value];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
