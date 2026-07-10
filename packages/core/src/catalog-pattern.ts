import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type CatalogPathMetadata = {
  locale?: string;
  namespace?: string;
};

export type ExpandedCatalogPath = CatalogPathMetadata & {
  filePath: string;
};

type CatalogPlaceholder = keyof CatalogPathMetadata;

const PLACEHOLDER_PATTERN = /\{(?:locale|namespace)\}/;
const PLACEHOLDER_SPLIT_PATTERN = /(\{(?:locale|namespace)\})/;

export function expandCatalogPattern(pattern: string): ExpandedCatalogPath[] {
  if (!PLACEHOLDER_PATTERN.test(pattern)) {
    return [{ filePath: path.resolve(pattern) }];
  }

  const absolutePattern = path.resolve(pattern);
  const root = fixedRoot(absolutePattern);
  if (!existsSync(root)) {
    return [
      {
        filePath: absolutePattern.replaceAll("{locale}", "*").replaceAll("{namespace}", "*")
      }
    ];
  }

  const matcher = catalogPatternMatcher(absolutePattern);
  const files: ExpandedCatalogPath[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const filePath = path.join(dir, entry);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        visit(filePath);
        continue;
      }

      const metadata = matcher(filePath);
      if (metadata) files.push({ filePath, ...metadata });
    }
  };

  visit(root);
  return files.sort((left, right) => left.filePath.localeCompare(right.filePath));
}

function fixedRoot(pattern: string): string {
  const parts = pattern.split(path.sep);
  const rootParts: string[] = [];
  for (const part of parts) {
    if (PLACEHOLDER_PATTERN.test(part)) break;
    rootParts.push(part);
  }
  return rootParts.length === 1 && rootParts[0] === "" ? path.sep : rootParts.join(path.sep);
}

function catalogPatternMatcher(
  pattern: string
): (filePath: string) => CatalogPathMetadata | undefined {
  const placeholders: CatalogPlaceholder[] = [];
  const expression = pattern
    .split(PLACEHOLDER_SPLIT_PATTERN)
    .map((token) => {
      const placeholder = placeholderName(token);
      if (placeholder) {
        placeholders.push(placeholder);
        return "([^\\\\/]+?)";
      }
      return escapeRegExp(token);
    })
    .join("");
  const regexp = new RegExp(`^${expression}$`);

  return (filePath) => {
    const captures = regexp.exec(filePath);
    if (!captures) return undefined;

    const metadata: CatalogPathMetadata = {};
    for (const [index, placeholder] of placeholders.entries()) {
      const value = captures[index + 1];
      if (value === undefined) continue;
      if (metadata[placeholder] !== undefined && metadata[placeholder] !== value) return undefined;
      metadata[placeholder] = value;
    }
    return metadata;
  };
}

function placeholderName(token: string): CatalogPlaceholder | undefined {
  if (token === "{locale}") return "locale";
  if (token === "{namespace}") return "namespace";
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
