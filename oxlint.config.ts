import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error"
  },
  env: {
    builtin: true,
    node: true,
    vitest: true
  },
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "**/dist/**",
    "**/tests/uses/**/invalid-source/**",
    "**/tests/uses/**/invalid-catalog/**"
  ],
  options: {
    typeAware: true
  },
  plugins: ["eslint", "typescript", "oxc", "import", "node", "vitest"],
  rules: {
    "typescript/no-unsafe-type-assertion": "off"
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/tests/**/*.ts"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off"
      }
    }
  ]
});
