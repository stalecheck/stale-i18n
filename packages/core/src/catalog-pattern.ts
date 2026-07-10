import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type CatalogPathMetadata = { locale?: string; namespace?: string };
export type ExpandedCatalogPath = CatalogPathMetadata & { filePath: string };
type CatalogPlaceholder = keyof CatalogPathMetadata;

const PLACEHOLDER_PATTERN = /\{(?:locale|namespace)\}/;
const PLACEHOLDER_SPLIT_PATTERN = /(\{(?:locale|namespace)\})/;

export async function expandCatalogPattern(pattern: string): Promise<ExpandedCatalogPath[]> {
  if (!PLACEHOLDER_PATTERN.test(pattern)) return [{ filePath: path.resolve(pattern) }];
  const absolutePattern = path.resolve(pattern);
  const root = fixedRoot(absolutePattern);
  try {
    if (!(await stat(root)).isDirectory()) return [];
  } catch {
    return [];
  }
  const matcher = catalogPatternMatcher(absolutePattern);
  const files: ExpandedCatalogPath[] = [];
  const visit = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.isFile()) {
        const metadata = matcher(filePath);
        if (metadata) files.push({ filePath, ...metadata });
      }
    }
  };
  await visit(root);
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
  return token === "{locale}" ? "locale" : token === "{namespace}" ? "namespace" : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
