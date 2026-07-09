import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@stale-i18n/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@stale-i18n/i18next": fileURLToPath(
        new URL("./packages/i18next/src/index.ts", import.meta.url)
      ),
      "@stale-i18n/formatjs": fileURLToPath(
        new URL("./packages/formatjs/src/index.ts", import.meta.url)
      ),
      "@stale-i18n/paraglide": fileURLToPath(
        new URL("./packages/paraglide/src/index.ts", import.meta.url)
      ),
      "@stale-i18n/cli": fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url))
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          include: ["packages/core/tests/unit/**/*.test.ts", "packages/core/tests/uses/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "i18next",
          include: [
            "packages/i18next/tests/unit/**/*.test.ts",
            "packages/i18next/tests/uses/**/*.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "formatjs",
          include: [
            "packages/formatjs/tests/unit/**/*.test.ts",
            "packages/formatjs/tests/uses/**/*.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "paraglide",
          include: [
            "packages/paraglide/tests/unit/**/*.test.ts",
            "packages/paraglide/tests/uses/**/*.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "cli",
          include: ["packages/cli/tests/unit/**/*.test.ts", "packages/cli/tests/uses/**/*.test.ts"]
        }
      }
    ],
    exclude: ["**/*.d.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.d.ts", "**/dist/**", "**/*.config.ts"],
      reportsDirectory: "coverage",
      reporter: ["text", "json", "lcovonly", "html"]
    }
  }
});
