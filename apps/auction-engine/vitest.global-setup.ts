import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startTestDb } from '@carat-room/test-db';

const dir = dirname(fileURLToPath(import.meta.url));

// Boot an embedded Postgres with the real auction-engine migrations for
// repository tests. An externally provided database (e.g. the Docker test
// environment) always wins.
export async function setup(): Promise<() => Promise<void>> {
  if (process.env.TEST_DATABASE_URL) {
    return async () => {};
  }
  const handle = await startTestDb({ migrationsDir: join(dir, 'migrations') });
  process.env.TEST_DATABASE_URL = handle.url;
  return async () => {
    await handle.stop();
  };
}
