import { Category } from '../domain/category';
import { CategoryRepository } from '../domain/category-repository';
import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError } from '../domain/errors';
import { Db } from './db';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function isPostgresErrorWithCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === code;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  display_order: number;
}

function rowToCategory(row: CategoryRow): Category {
  return new Category({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    displayOrder: row.display_order,
  });
}

export class PostgresCategoryRepository implements CategoryRepository {
  constructor(private readonly db: Db) {}

  async findAll(): Promise<Category[]> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories ORDER BY display_order ASC
    `;
    return rows.map(rowToCategory);
  }

  async findBySlug(slug: string): Promise<Category | null> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories WHERE slug = ${slug}
    `;
    return rows.length > 0 ? rowToCategory(rows[0]) : null;
  }

  async findById(id: string): Promise<Category | null> {
    const rows = await this.db<CategoryRow[]>`
      SELECT id, name, slug, parent_id, display_order
      FROM categories WHERE id = ${id}
    `;
    return rows.length > 0 ? rowToCategory(rows[0]) : null;
  }

  async create(category: Category): Promise<void> {
    try {
      await this.db`
        INSERT INTO categories (id, name, slug, parent_id, display_order)
        VALUES (${category.id}, ${category.name}, ${category.slug}, ${category.parentId}, ${category.displayOrder})
      `;
    } catch (err) {
      if (isPostgresErrorWithCode(err, UNIQUE_VIOLATION)) {
        throw new CategorySlugConflictError(category.slug);
      }
      throw err;
    }
  }

  async updateName(id: string, name: string): Promise<void> {
    const rows = await this.db<{ id: string }[]>`
      UPDATE categories SET name = ${name} WHERE id = ${id} RETURNING id
    `;
    if (rows.length === 0) {
      throw new CategoryNotFoundError(id);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const rows = await this.db<{ id: string }[]>`
        DELETE FROM categories WHERE id = ${id} RETURNING id
      `;
      if (rows.length === 0) {
        throw new CategoryNotFoundError(id);
      }
    } catch (err) {
      if (isPostgresErrorWithCode(err, FOREIGN_KEY_VIOLATION)) {
        throw new CategoryHasLotsError(id);
      }
      throw err;
    }
  }
}
