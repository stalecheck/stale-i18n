import { glob, stat } from "node:fs/promises";
import path, { matchesGlob } from "node:path";
import type { SourceTarget } from "./types.js";

export async function discoverSourceFiles(
  target: SourceTarget,
  ignorePaths?: string[]
): Promise<string[]> {
  const files = await Promise.all(
    sourceTargets(target).map((sourceTarget) =>
      discoverSourceTargetFiles(sourceTarget, effectiveIgnorePaths(ignorePaths))
    )
  );
  return [...new Set(files.flat())].sort();
}

export async function sourceTargetExists(target: SourceTarget): Promise<boolean> {
  return (await Promise.all(sourceTargets(target).map(sourceTargetPathExists))).some(Boolean);
}

export function formatSourceTarget(target: SourceTarget): string {
  return sourceTargets(target)
    .map((sourceTarget) => path.resolve(sourceTarget))
    .join(", ");
}

function sourceTargets(target: SourceTarget): string[] {
  return Array.isArray(target) ? target : [target];
}

async function sourceTargetPathExists(sourceTarget: string): Promise<boolean> {
  const absoluteTarget = path.resolve(sourceTarget);
  try {
    await stat(absoluteTarget);
    return true;
  } catch {
    if (!hasGlobMagic(sourceTarget)) return false;
    for await (const _ of glob(sourceTargetGlob(sourceTarget).pattern)) return true;
    return false;
  }
}

async function discoverSourceTargetFiles(target: string, ignorePaths: string[]): Promise<string[]> {
  const absoluteTarget = path.resolve(target);
  try {
    const targetStat = await stat(absoluteTarget);
    const cwd = targetStat.isFile() ? path.dirname(absoluteTarget) : absoluteTarget;
    const pattern = targetStat.isFile()
      ? path.basename(absoluteTarget)
      : "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}";
    if (targetStat.isFile() && !isSourceFile(absoluteTarget)) return [];
    return sourceFileGlob(pattern, cwd, cwd, ignorePaths);
  } catch {
    if (!hasGlobMagic(target)) return [];
    const globTarget = sourceTargetGlob(target);
    return sourceFileGlob(globTarget.pattern, undefined, globTarget.root, ignorePaths);
  }
}

function isSourceFile(filePath: string): boolean {
  return /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(filePath);
}

async function sourceFileGlob(
  pattern: string,
  cwd: string | undefined,
  ignoreRoot: string,
  ignorePaths: string[]
): Promise<string[]> {
  const files: string[] = [];
  for await (const filePath of glob(pattern, cwd === undefined ? {} : { cwd })) {
    const absolutePath = path.resolve(cwd ?? process.cwd(), filePath);
    try {
      if ((await stat(absolutePath)).isFile()) files.push(absolutePath);
    } catch {
      // A matched file can disappear before it is read.
    }
  }
  return files
    .filter(isSourceFile)
    .filter((filePath) => !isIgnoredPath(filePath, ignoreRoot, ignorePaths))
    .sort();
}

function isIgnoredPath(filePath: string, root: string, ignorePaths: string[]): boolean {
  const candidates = pathCandidates(filePath, root);
  const patterns = normalizedIgnorePaths(root, ignorePaths);
  return patterns.some((pattern) =>
    candidates.some((candidate) => matchesGlob(candidate, pattern))
  );
}

function normalizedIgnorePaths(root: string, ignorePaths: string[]): string[] {
  return ignorePaths.flatMap((ignorePath) => {
    const relativePath = path.isAbsolute(ignorePath) ? path.relative(root, ignorePath) : ignorePath;
    const normalizedPath = normalizeGlobPath(relativePath);
    return hasGlobMagic(normalizedPath)
      ? [normalizedPath]
      : [normalizedPath, `${normalizedPath}/**`];
  });
}

function pathCandidates(filePath: string, root: string): string[] {
  const normalizedAbsolute = normalizeGlobPath(filePath);
  const normalizedRelative = normalizeGlobPath(path.relative(root, filePath));
  const parts = normalizedAbsolute.split("/");
  const suffixes = parts.map((_, index) => parts.slice(index).join("/"));
  return [
    ...new Set([normalizedAbsolute, normalizedRelative, path.posix.basename(filePath), ...suffixes])
  ];
}

function normalizeGlobPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function hasGlobMagic(pattern: string): boolean {
  return /[*?[\]{}()!+@]/.test(pattern);
}

function effectiveIgnorePaths(ignorePaths: string[] | undefined): string[] {
  return ignorePaths ?? ["**/node_modules/**", "**/dist/**", "**/coverage/**"];
}

function sourceTargetGlob(target: string): { root: string; pattern: string } {
  const absoluteTarget = path.resolve(target);
  return { root: fixedGlobRoot(absoluteTarget), pattern: normalizeGlobPath(absoluteTarget) };
}

function fixedGlobRoot(pattern: string): string {
  const magicIndex = pattern.search(/[*?[\]{}()!+@]/);
  if (magicIndex === -1) return path.dirname(pattern);
  const fixedPrefix = pattern.slice(0, magicIndex);
  const lastSeparatorIndex = Math.max(
    fixedPrefix.lastIndexOf(path.sep),
    fixedPrefix.lastIndexOf(path.posix.sep)
  );
  return lastSeparatorIndex <= 0 ? process.cwd() : fixedPrefix.slice(0, lastSeparatorIndex);
}
