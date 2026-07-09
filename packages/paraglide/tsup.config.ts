import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as { dependencies?: Record<string, string> };

export default defineConfig({
  entry: {
    index: "./src/index.ts"
  },
  outDir: "dist",
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "node",
  target: "es2022",
  skipNodeModulesBundle: true,
  external: Object.keys(packageJson.dependencies ?? {}),
  tsconfig: "../../tsconfig.build.json"
});
