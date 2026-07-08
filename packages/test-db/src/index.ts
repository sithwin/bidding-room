import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';

export interface TestDbHandle {
  url: string;
  stop: () => Promise<void>;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

// Boots an in-process embedded Postgres, applies migrations/*.sql in filename
// order, and serves the wire protocol on a free localhost port.
export async function startTestDb(options: { migrationsDir: string }): Promise<TestDbHandle> {
  const db = await PGlite.create({ extensions: { uuid_ossp } });

  const migrationFiles = readdirSync(options.migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();

  // If a migration fails partway through, the already-created PGlite instance
  // must still be closed here — the caller never receives a handle to close
  // it themselves, so leaving this uncaught would leak a WASM PGlite instance
  // per failed boot.
  try {
    for (const file of migrationFiles) {
      await db.exec(readFileSync(join(options.migrationsDir, file), 'utf8'));
    }
  } catch (error) {
    await db.close();
    throw error;
  }

  const port = await findFreePort();
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port });
  await server.start();

  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

// PGlite is effectively single-connection: repository tests must not pool.
// `onnotice` is silenced because PGlite's socket bridge surfaces its internal
// DEBUG-level protocol notices (parse/bind messages) as NOTICE frames, which
// postgres.js prints to stdout by default and would otherwise drown out test
// output.
export function createTestDb(url: string): ReturnType<typeof postgres> {
  return postgres(url, { max: 1, onnotice: () => {} });
}
