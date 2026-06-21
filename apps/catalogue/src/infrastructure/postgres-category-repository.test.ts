import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDb, Db } from './db';
import { PostgresCategoryRepository } from './postgres-category-repository';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/catalogue_test';

describe('PostgresCategoryRepository', () => {
  let db: Db;
  let repo: PostgresCategoryRepository;

  beforeEach(async () => {
    db = createDb(TEST_DB_URL);
    repo = new PostgresCategoryRepository(db);
    await db`DELETE FROM categories`;
  });

  afterEach(async () => {
    await db.end();
  });

  it('should_returnEmpty_when_noCategories', async () => {
    const result = await repo.findAll();
    expect(result).toHaveLength(0);
  });

  it('should_findBySlug_when_categoryExists', async () => {
    await db`
      INSERT INTO categories (id, name, slug, parent_id, display_order)
      VALUES ('aaaaaaaa-0000-0000-0000-000000000000', 'Rings', 'rings', NULL, 1)
    `;

    const result = await repo.findBySlug('rings');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Rings');
    expect(result!.slug).toBe('rings');
  });

  it('should_returnNull_when_slugNotFound', async () => {
    const result = await repo.findBySlug('nonexistent');
    expect(result).toBeNull();
  });
});
