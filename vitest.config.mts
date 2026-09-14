import { defineConfig } from 'vitest/config';


export default defineConfig({
  test: {
    environment: 'node',
    // Route handlers are tested too: /api/thesis spends money, so its auth,
    // rate limiting and write-on-completion rules need covering.
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': import.meta.dirname },
  },
});
