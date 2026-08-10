import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { layerBoundaries } from "./eslint/layer-boundaries.js";
import { designTokenRules } from "./eslint/design-tokens.js";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Планка качества: any и мёртвый код — ошибка, не предупреждение.
      // В предыдущей версии оба правила были выключены, поэтому «ноль
      // ошибок типов» ничего не гарантировал.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 12],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  ...layerBoundaries,
  designTokenRules,

  {
    files: ["**/*.{test,spec}.{ts,tsx,mjs}", "src/test/**"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": "off",
    },
  },

  {
    files: ["*.config.{ts,js}", "eslint/**/*.js", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
    },
  },
);
