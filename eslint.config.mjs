import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".history/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "public/sw.js",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // These React Compiler diagnostics are too noisy for the current app
      // patterns (client hydration flags, cache hydration, and manual memo deps).
      // Keep the core Hooks rules enabled; revisit these once the app opts into
      // compiler-oriented refactors more broadly.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
