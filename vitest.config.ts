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
    // Default (5000ms) is too tight for test files that dynamically import
    // `@/app/api/orders/route` (which pulls in Next.js server internals, Mongoose, Clerk,
    // and Cashfree at module-load time) when several such files run concurrently in
    // separate forked processes and compete for CPU — this is pure cold-start/transform
    // time under parallel load, not a hang. Raised globally so any current or future
    // heavy-import test file gets the same safety margin instead of being tuned one by one.
    testTimeout: 20000,
    // Dummy, non-production value only so modules that assert required env vars at import
    // time (e.g. auth.ts's JWT_SECRET check) can be imported under test. Never a real secret.
    env: {
      JWT_SECRET: 'test-only-dummy-secret-do-not-use-in-production',
      // Dummy, well-formed value only so mongodb.ts's import-time assertion passes when a
      // test imports it directly (e.g. for isDbConnectionError). Never a real connection
      // string, and no test in this suite opens a real database connection.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/test-only-dummy',
    },
  },
});
