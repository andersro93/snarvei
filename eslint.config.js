import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist", ".wrangler", "worker-configuration.d.ts", "node_modules", "playwright-report", "test-results"]),
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Dangling promises are real bugs in request handlers and React handlers.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // Too noisy for a zod/openapi/drizzle codebase; TS itself checks these.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // React admin app
    files: ["src/react-app/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // Cloudflare Worker + tests run in workerd (service-worker-like globals), not Node.
    files: ["src/worker/**/*.ts", "src/shared/**/*.ts", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.es2021 } },
  },
  {
    // Tests cast `await response.json()` (typed any by lib.dom) into DTOs on purpose.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-unnecessary-type-assertion": "off" },
  },
  {
    // Node-side tooling configs
    files: ["*.config.{ts,mts,js}", "drizzle.config.ts", "playwright.config.ts"],
    languageOptions: { globals: globals.node },
  },
);
