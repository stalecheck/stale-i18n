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
        "typescript/no-unsafe-type-assertion": "off",
        "vitest/expect-expect": "off"
      }
    },
    {
      files: ["**/tests/uses/**/*.{ts,tsx}"],
      rules: {
        "import/no-named-as-default-member": "off"
      }
    }
  ]
});
