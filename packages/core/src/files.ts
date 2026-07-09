import { existsSync, globSync, statSync } from "node:fs";
import path, { matchesGlob } from "node:path";
import type { SourceTarget } from "./types.js";

export function discoverSourceFiles(target: SourceTarget, ignorePaths?: string[]): string[] {
  const files = sourceTargets(target).flatMap((sourceTarget) =>
    discoverSourceTargetFiles(sourceTarget, effectiveIgnorePaths(ignorePaths))
  );
  return [...new Set(files)].sort();
}

export function sourceTargetExists(target: SourceTarget): boolean {
  return sourceTargets(target).some((sourceTarget) => {
    const absoluteTarget = path.resolve(sourceTarget);
    if (existsSync(absoluteTarget)) {
      return true;
    }
    if (!hasGlobMagic(sourceTarget)) {
      return false;
    }
    const globTarget = sourceTargetGlob(sourceTarget);
    return globSync(globTarget.pattern, { cwd: globTarget.cwd }).length > 0;
  });
}

export function formatSourceTarget(target: SourceTarget): string {
  return sourceTargets(target)
    .map((sourceTarget) => path.resolve(sourceTarget))
    .join(", ");
}

function sourceTargets(target: SourceTarget): string[] {
  return Array.isArray(target) ? target : [target];
}

function discoverSourceTargetFiles(target: string, ignorePaths: string[]): string[] {
  const absoluteTarget = path.resolve(target);
  if (!existsSync(absoluteTarget)) {
    if (!hasGlobMagic(target)) {
      return [];
    }
    const globTarget = sourceTargetGlob(target);
    return sourceFileGlob(globTarget.pattern, globTarget.cwd, globTarget.cwd, ignorePaths);
  }

  if (hasGlobMagic(target)) {
    const globTarget = sourceTargetGlob(target);
    return sourceFileGlob(globTarget.pattern, globTarget.cwd, globTarget.cwd, ignorePaths);
  }

  return discoverLiteralSourceTargetFiles(absoluteTarget, ignorePaths);
}

function discoverLiteralSourceTargetFiles(absoluteTarget: string, ignorePaths: string[]): string[] {
  if (!existsSync(absoluteTarget)) {
    return [];
  }

  const targetStat = statSync(absoluteTarget);
  const cwd = targetStat.isFile() ? path.dirname(absoluteTarget) : absoluteTarget;
  const pattern = targetStat.isFile()
    ? path.basename(absoluteTarget)
    : "**/*.{js,jsx,ts,tsx,mjs,cjs}";

  if (targetStat.isFile()) {
    if (!isSourceFile(absoluteTarget)) {
      return [];
    }
    return sourceFileGlob(pattern, cwd, cwd, ignorePaths);
  }

  return sourceFileGlob(pattern, cwd, cwd, ignorePaths);
}

function isSourceFile(filePath: string): boolean {
  return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(filePath);
}

function sourceFileGlob(
  pattern: string,
  cwd: string,
  ignoreRoot: string,
  ignorePaths: string[]
): string[] {
  return globSync(pattern, { cwd })
    .map((filePath) => path.resolve(cwd, filePath))
    .filter((filePath) => statSync(filePath).isFile())
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

function sourceTargetGlob(target: string): { cwd: string; pattern: string } {
  const absoluteTarget = path.resolve(target);
  const cwd = fixedGlobRoot(absoluteTarget);
  return {
    cwd,
    pattern: normalizeGlobPath(path.relative(cwd, absoluteTarget))
  };
}

function fixedGlobRoot(pattern: string): string {
  const magicIndex = pattern.search(/[*?[\]{}()!+@]/);
  if (magicIndex === -1) {
    return path.dirname(pattern);
  }

  const fixedPrefix = pattern.slice(0, magicIndex);
  const lastSeparatorIndex = Math.max(
    fixedPrefix.lastIndexOf(path.sep),
    fixedPrefix.lastIndexOf(path.posix.sep)
  );
  if (lastSeparatorIndex <= 0) {
    return process.cwd();
  }
  return fixedPrefix.slice(0, lastSeparatorIndex);
}
