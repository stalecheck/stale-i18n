import type { I18nextCheckOptions, TranslationKey } from "./types.js";

export const DEFAULT_KEY_SEPARATOR = ".";

export type KeySeparator = Exclude<I18nextCheckOptions["keySeparator"], undefined>;

export function normalizeKeySeparator(
  separator: I18nextCheckOptions["keySeparator"]
): KeySeparator {
  return separator === false ? false : (separator ?? DEFAULT_KEY_SEPARATOR);
}

export function parseTranslationKey(value: string, separator: KeySeparator): TranslationKey {
  if (separator === false) {
    return { kind: "literal", value };
  }
  return { kind: "path", segments: value.split(separator) };
}

export function translationKeyFromSegments(segments: string[]): TranslationKey {
  return { kind: "path", segments };
}

export function prependTranslationKey(
  prefix: string | undefined,
  value: string,
  separator: KeySeparator
): TranslationKey {
  if (prefix === undefined || prefix === "") {
    return parseTranslationKey(value, separator);
  }

  if (separator === false) {
    return {
      kind: "literal",
      value: `${prefix}${DEFAULT_KEY_SEPARATOR}${value}`
    };
  }

  return {
    kind: "path",
    segments: [...prefix.split(separator), ...value.split(separator)]
  };
}

export function appendTranslationKeySuffix(key: TranslationKey, suffix: string): TranslationKey {
  if (suffix === "") {
    return key;
  }
  if (key.kind === "literal") {
    return { kind: "literal", value: `${key.value}${suffix}` };
  }

  const segments = [...key.segments];
  const lastIndex = segments.length - 1;
  if (lastIndex < 0) {
    return { kind: "path", segments: [suffix] };
  }
  segments[lastIndex] = `${segments[lastIndex]}${suffix}`;
  return { kind: "path", segments };
}

export function translationKeyId(key: TranslationKey): string {
  return key.kind === "literal"
    ? JSON.stringify(["literal", key.value])
    : JSON.stringify(["path", key.segments]);
}

export function displayTranslationKey(key: TranslationKey, separator: KeySeparator): string {
  if (key.kind === "literal") {
    return key.value;
  }
  return key.segments.join(separator === false ? DEFAULT_KEY_SEPARATOR : separator);
}

export function translationKeyLeaf(key: TranslationKey): string {
  return key.kind === "literal" ? key.value : (key.segments.at(-1) ?? "");
}

export function translationKeyHasSameParent(left: TranslationKey, right: TranslationKey): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "literal" || right.kind === "literal") {
    return true;
  }
  if (left.segments.length !== right.segments.length) {
    return false;
  }
  return left.segments.slice(0, -1).every((segment, index) => segment === right.segments[index]);
}
