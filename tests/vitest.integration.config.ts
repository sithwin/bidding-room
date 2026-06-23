import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
    include: ['tests/integration/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
