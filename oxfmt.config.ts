import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "**/dist/**",
    "**/tests/uses/**/invalid-source/**",
    "**/tests/uses/**/invalid-catalog/**"
  ],
  printWidth: 100,
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "none"
});
