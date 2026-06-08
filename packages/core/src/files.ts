import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function discoverSourceFiles(target: string, ignore: string[] = []): string[] {
  const absoluteTarget = path.resolve(target);
  if (!existsSync(absoluteTarget)) {
    return [];
  }

  const ignored = (filePath: string) => ignore.some((pattern) => filePath.includes(pattern));
  if (statSync(absoluteTarget).isFile()) {
    return isSourceFile(absoluteTarget) && !ignored(absoluteTarget) ? [absoluteTarget] : [];
  }

  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const filePath = path.join(dir, entry);
      if (ignored(filePath)) {
        continue;
      }

      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        if (entry !== "node_modules" && entry !== "dist" && entry !== "coverage") {
          visit(filePath);
        }
      } else if (isSourceFile(filePath)) {
        files.push(filePath);
      }
    }
  };
  visit(absoluteTarget);
  return files.sort();
}

function isSourceFile(filePath: string): boolean {
  return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(filePath);
}
