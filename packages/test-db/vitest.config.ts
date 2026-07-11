import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // tests that spin up their own PGlite instance inline can exceed the 5s default under CI load
    testTimeout: 20000,
    coverage,
  },
});
