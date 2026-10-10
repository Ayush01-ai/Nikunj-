import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Minimal Vitest config, additive to the project (no existing test runner was configured).
 * Scoped to `tests/**` only so it never collects/transforms the Next.js app source as test
 * files — tests import from `src/` via the same `@/` alias used by the app itself.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Dummy, non-production value only so modules that assert required env vars at import
    // time (e.g. auth.ts's JWT_SECRET check) can be imported under test. Never a real secret.
    env: {
      JWT_SECRET: 'test-only-dummy-secret-do-not-use-in-production',
    },
  },
});
