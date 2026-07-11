import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startTestDb, createTestDb } from '@carat-room/test-db';
import { runMigrations } from './index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

describe('runMigrations', () => {
  let handle: Awaited<ReturnType<typeof startTestDb>>;
  let sql: ReturnType<typeof createTestDb>;

  beforeAll(async () => {
    handle = await startTestDb({ migrationsDir: join(fixturesDir, 'empty') });
    sql = createTestDb(handle.url);
  });

  afterAll(async () => {
    await sql.end();
    await handle.stop();
  });

  it('should_applyAllPendingMigrations_when_noneApplied', async () => {
    const applied = await runMigrations(sql, join(fixturesDir, 'step1'));
    expect(applied).toEqual(['001_create_widgets.sql']);

    await sql`INSERT INTO widgets (name) VALUES ('sprocket')`;
    const rows = await sql`SELECT name FROM widgets`;
    expect(rows.map(row => row.name)).toEqual(['sprocket']);
  });

  it('should_applyOnlyNewMigration_when_someAlreadyApplied', async () => {
    const applied = await runMigrations(sql, join(fixturesDir, 'step1and2'));
    expect(applied).toEqual(['002_add_widget_colour.sql']);

    await sql`UPDATE widgets SET colour = 'red' WHERE name = 'sprocket'`;
    const rows = await sql`SELECT colour FROM widgets WHERE name = 'sprocket'`;
    expect(rows[0].colour).toBe('red');
  });

  it('should_applyNothing_when_reRunWithNoNewMigrations', async () => {
    const applied = await runMigrations(sql, join(fixturesDir, 'step1and2'));
    expect(applied).toEqual([]);
  });

  it('should_recordAppliedMigrations_inSchemaMigrationsTable', async () => {
    const rows = await sql`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(rows.map(row => row.filename)).toEqual([
      '001_create_widgets.sql',
      '002_add_widget_colour.sql',
    ]);
  });
});

describe('runMigrations against a database with pre-existing, untracked schema', () => {
  // Simulates a developer whose local database already has these tables from
  // before migrate-on-boot existed (built up manually, or by an old version
  // of the service) — schema_migrations has never been created for them.
  it('should_backfillTrackingWithoutError_when_migrationsAreIdempotentAndTablesAlreadyExist', async () => {
    const idempotentDir = join(fixturesDir, 'idempotent');

    // startTestDb applies the SQL files directly, bypassing runMigrations
    // entirely — exactly like a table that was created by hand or by an
    // older, pre-migration-runner version of the service.
    const preExistingHandle = await startTestDb({ migrationsDir: idempotentDir });
    const preExistingSql = createTestDb(preExistingHandle.url);

    const applied = await runMigrations(preExistingSql, idempotentDir);
    expect(applied).toEqual(['001_create_widgets.sql', '002_add_widget_colour.sql']);

    const tracked = await preExistingSql`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(tracked.map(row => row.filename)).toEqual([
      '001_create_widgets.sql',
      '002_add_widget_colour.sql',
    ]);

    const rerunApplied = await runMigrations(preExistingSql, idempotentDir);
    expect(rerunApplied).toEqual([]);

    await preExistingSql.end();
    await preExistingHandle.stop();
  });
});

describe('runMigrations failure handling', () => {
  it('should_rejectAndNotRecord_when_aMigrationFileIsInvalid', async () => {
    const badHandle = await startTestDb({ migrationsDir: join(fixturesDir, 'empty') });
    const badSql = createTestDb(badHandle.url);
    const badDir = join(fixturesDir, 'bad');

    // The whole batch runs in one transaction, so a failing migration rolls
    // back everything from this boot attempt — even the schema_migrations
    // table itself never gets committed on a database that has never
    // successfully migrated before.
    await expect(runMigrations(badSql, badDir)).rejects.toThrow();
    await expect(badSql`SELECT filename FROM schema_migrations`).rejects.toThrow();

    await badSql.end();
    await badHandle.stop();
  });
});
