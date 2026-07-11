import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
    coverage,
  },
});
