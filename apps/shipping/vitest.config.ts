import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
    coverage,
  },
});
