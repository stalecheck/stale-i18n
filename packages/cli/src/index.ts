import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCli } from "./program.js";

export { runCli };
export type { CliFormat, CliRunResult } from "./formatting.js";

if (isCliEntrypoint()) {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;

  try {
    return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
