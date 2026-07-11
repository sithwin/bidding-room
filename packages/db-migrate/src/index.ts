import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

// Arbitrary fixed key for the session advisory lock guarding schema_migrations.
// Prevents two replicas of the same service booting concurrently from racing
// to apply the same pending migration.
const ADVISORY_LOCK_KEY = 727652310;

// Applies any *.sql file in migrationsDir not yet recorded in schema_migrations,
// in filename order, each in its own transaction. Safe to call on every boot:
// already-applied files are skipped. Returns the filenames actually applied.
export async function runMigrations(sql: Sql, migrationsDir: string): Promise<string[]> {
  return sql.begin(async tx => {
    // Transaction-scoped advisory lock: held for the whole batch, auto-released
    // on commit/rollback. Blocks concurrent replicas of the same service from
    // racing to apply the same pending migration on boot.
    await tx`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const appliedRows = await tx<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
    const applied = new Set(appliedRows.map(row => row.filename));

    const pending = readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .sort()
      .filter(name => !applied.has(name));

    for (const filename of pending) {
      const contents = readFileSync(join(migrationsDir, filename), 'utf8');
      await tx.unsafe(contents);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
    }

    return pending;
  });
}
