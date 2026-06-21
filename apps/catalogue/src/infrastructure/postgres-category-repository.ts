import { Category } from '../domain/category';
import { CategoryRepository } from '../domain/category-repository';
import { Db } from './db';

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
}
