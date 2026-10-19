import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // This rule flags the standard "sync local state to an external store /
      // reset on dependency change" effect pattern (used throughout this app for
      // Zustand hydration guards and controlled-input resets). It is a React
      // performance best-practice, not a correctness or security rule, so it is
      // kept visible as a warning rather than disabled or rewritten wholesale.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "dist/**",
    // Vendored third-party agent-skill tooling, not part of the application.
    "_ai-tooling/**",
  ]),
]);

export default eslintConfig;
