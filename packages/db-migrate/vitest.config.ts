import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // tests (and their beforeAll/afterAll hooks) that spin up their own PGlite instance
    // inline can exceed the 5s/10s defaults under CI load
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage,
  },
});
