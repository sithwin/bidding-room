import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
    // `sequence.concurrent: false` only stops `it` blocks within one file
    // running concurrently — Vitest still runs separate test *files* in
    // parallel worker processes by default. Every flow-N file's `beforeAll`
    // unconditionally TRUNCATEs all tables in every shared service database
    // (tests/helpers/db.ts's resetDb), so two files running at once corrupt
    // each other mid-flight (one file's reset wipes rows another file's
    // still-in-progress test depends on) — this was the real cause of the
    // "waitFor condition never became true" flakiness across flow-1/2/3,
    // not the RabbitMQ healthcheck race it was first mistaken for.
    fileParallelism: false,
    include: ['tests/integration/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
