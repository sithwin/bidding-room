import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { Db } from './db';
import { PostgresCategoryRepository } from './postgres-category-repository';
import { Category } from '../domain/category';
import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError } from '../domain/errors';

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/catalogue_test';

describe('PostgresCategoryRepository', () => {
  let db: Db;
  let repo: PostgresCategoryRepository;

  beforeEach(async () => {
    db = createTestDb(TEST_DB_URL) as Db;
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

  it('should_persistCategory_when_created', async () => {
    const category = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000000', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 0 });

    await repo.create(category);

    const result = await repo.findById(category.id);
    expect(result?.name).toBe('Rings');
    expect(result?.slug).toBe('rings');
  });

  it('should_throwSlugConflict_when_slugAlreadyInUse', async () => {
    const first = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000001', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 0 });
    const duplicate = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'Rings 2', slug: 'rings', parentId: null, displayOrder: 0 });
    await repo.create(first);

    await expect(repo.create(duplicate)).rejects.toThrow(CategorySlugConflictError);
  });

  it('should_updateName_when_categoryExists', async () => {
    const category = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000003', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 0 });
    await repo.create(category);

    await repo.updateName(category.id, 'Updated Rings');

    const result = await repo.findById(category.id);
    expect(result?.name).toBe('Updated Rings');
  });

  it('should_throwNotFound_when_renamingMissingCategory', async () => {
    await expect(repo.updateName('99999999-0000-0000-0000-000000000000', 'New Name')).rejects.toThrow(CategoryNotFoundError);
  });

  it('should_deleteCategory_when_noLotsAssigned', async () => {
    const category = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000004', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 0 });
    await repo.create(category);

    await repo.delete(category.id);

    const result = await repo.findById(category.id);
    expect(result).toBeNull();
  });

  it('should_throwNotFound_when_deletingMissingCategory', async () => {
    await expect(repo.delete('99999999-0000-0000-0000-000000000000')).rejects.toThrow(CategoryNotFoundError);
  });

  it('should_throwHasLots_when_lotsAssignedToCategory', async () => {
    const category = new Category({ id: 'bbbbbbbb-0000-0000-0000-000000000005', name: 'Rings', slug: 'rings', parentId: null, displayOrder: 0 });
    await repo.create(category);
    await db`
      INSERT INTO lots (id, title, category_id)
      VALUES ('cccccccc-0000-0000-0000-000000000000', 'Test Lot', ${category.id})
    `;

    await expect(repo.delete(category.id)).rejects.toThrow(CategoryHasLotsError);

    await db`DELETE FROM lots WHERE id = 'cccccccc-0000-0000-0000-000000000000'`;
  });
});
