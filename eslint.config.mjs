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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code's scratch worktrees: whole copies of this repo, node_modules
    // and all. Linting them buried the project's own output under ~12,000
    // problems from code that is not the project's.
    ".claude/**",
  ]),
]);

export default eslintConfig;
