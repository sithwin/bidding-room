import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startTestDb, createTestDb } from './index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('test-db', () => {
  let handle: Awaited<ReturnType<typeof startTestDb>>;

  beforeAll(async () => {
    handle = await startTestDb({ migrationsDir: fixturesDir });
  });

  afterAll(async () => {
    await handle.stop();
  });

  it('should_applyMigrationsAndAcceptValidSql', async () => {
    const db = createTestDb(handle.url);
    await db`INSERT INTO widgets (name) VALUES ('sprocket')`;
    const rows = await db`SELECT id, name FROM widgets`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('sprocket');
    await db.end();
  });

  it('should_rejectPhantomColumnSql', async () => {
    // the starting_price bug class: SQL referencing a column no migration creates
    const db = createTestDb(handle.url);
    await expect(db`SELECT starting_price FROM widgets`).rejects.toThrow(/starting_price/);
    await db.end();
  });
});
