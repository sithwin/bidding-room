import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

  it('should_matchFullTextSearchQuery_when_blurbIsStoredAsTsvector', async () => {
    const db = createTestDb(handle.url);
    await db`
      INSERT INTO widgets (name, blurb)
      VALUES ('gizmo', to_tsvector('english', 'a precision sprocket assembly'))
    `;

    const matches = await db`
      SELECT name FROM widgets
      WHERE name = 'gizmo' AND blurb @@ to_tsquery('english', 'sprocket')
    `;
    const nonMatches = await db`
      SELECT name FROM widgets
      WHERE name = 'gizmo' AND blurb @@ to_tsquery('english', 'unrelated')
    `;

    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('gizmo');
    expect(nonMatches).toHaveLength(0);
    await db.end();
  });
});

describe('startTestDb migration failure', () => {
  it('should_rejectAndReleasePgliteInstance_when_aMigrationFileIsInvalid', async () => {
    const badMigrationsDir = mkdtempSync(join(tmpdir(), 'test-db-bad-migrations-'));
    writeFileSync(join(badMigrationsDir, '001_broken.sql'), 'CREATE TABLE this is not valid sql;');

    await expect(startTestDb({ migrationsDir: badMigrationsDir })).rejects.toThrow();

    // Proxy for "no PGlite instance/socket was leaked": a subsequent, unrelated
    // startTestDb call with valid migrations must still succeed cleanly.
    const followUpHandle = await startTestDb({ migrationsDir: fixturesDir });
    const db = createTestDb(followUpHandle.url);
    const rows = await db`SELECT 1 AS ok`;
    expect(rows[0].ok).toBe(1);
    await db.end();
    await followUpHandle.stop();

    rmSync(badMigrationsDir, { recursive: true, force: true });
  }, 20000); // spins up two full PGlite instances sequentially - default 5000ms is too tight under CI load
});
