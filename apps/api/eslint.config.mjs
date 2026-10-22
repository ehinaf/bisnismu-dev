// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist/**", "coverage/**", "jest*.config.js"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // Prefiks "_" = sengaja tidak dipakai (mis. membuang field sensitif saat destructuring).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Mock Prisma di unit test sengaja longgar tipenya.
    files: ["**/*.spec.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);
