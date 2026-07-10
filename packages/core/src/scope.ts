import { analyze, DefinitionType, type Variable } from "@typescript-eslint/scope-manager";
import { visitorKeys } from "oxc-parser";
import type { AnyNode } from "./types.js";

export type BindingId = number;

type BindingInfo = {
  id: BindingId;
  constant: boolean;
  stable: boolean;
};

export type SourceScope = {
  bindingId(node: unknown): BindingId | undefined;
  isConstant(node: unknown): boolean;
  isStable(node: unknown): boolean;
};

export function createSourceScope(program: AnyNode): SourceScope {
  const manager = analyze(program as never, {
    sourceType: "module",
    childVisitorKeys: visitorKeys,
    lib: []
  });
  const bindings = new WeakMap<object, BindingInfo>();

  for (const scope of manager.scopes) {
    for (const variable of scope.variables) {
      registerVariable(variable, bindings);
    }
  }

  function info(node: unknown): BindingInfo | undefined {
    return node !== null && typeof node === "object" ? bindings.get(node) : undefined;
  }

  return {
    bindingId(node) {
      return info(node)?.id;
    },
    isConstant(node) {
      return info(node)?.constant ?? false;
    },
    isStable(node) {
      return info(node)?.stable ?? false;
    }
  };
}

function registerVariable(variable: Variable, bindings: WeakMap<object, BindingInfo>) {
  const constant = variable.defs.some(
    (definition) =>
      definition.type === DefinitionType.Variable && definition.parent.kind === "const"
  );
  const stable = !variable.references.some(
    (reference) => reference.isWrite() && reference.init !== true
  );
  const info = { id: variable.$id, constant, stable };

  for (const identifier of variable.identifiers) {
    bindings.set(identifier, info);
  }
  for (const reference of variable.references) {
    bindings.set(reference.identifier, info);
  }
}
