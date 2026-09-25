import { defineConfig } from 'vitest/config';


export default defineConfig({
  test: {
    environment: 'node',
    // Route handlers are tested too: /api/thesis spends money, so its auth,
    // rate limiting and write-on-completion rules need covering.
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
      // Server-role modules guard themselves with `server-only`, which throws
      // when bundled for the client. There is no client bundle under test, so
      // it is stubbed to a no-op — otherwise importing a pure helper that
      // happens to sit in a server-only module (e.g. allowedEmailsFromEnv)
      // would fail the whole suite.
      'server-only': `${import.meta.dirname}/test/serverOnlyStub.ts`,
    },
  },
});
