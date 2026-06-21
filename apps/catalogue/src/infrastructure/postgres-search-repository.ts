import { LotSearchResult, SearchFilters, SearchRepository } from '../domain/search-repository';
import { Db } from './db';

interface SearchRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  estimated_value: string | null;
  category_id: string | null;
  count: string;
}

export class PostgresSearchRepository implements SearchRepository {
  constructor(private readonly db: Db) {}

  async search(
    query: string,
    filters: SearchFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: LotSearchResult[]; total: number }> {
    const conditions: string[] = [`l.search_vector @@ plainto_tsquery('english', $1)`];
    const values: unknown[] = [query];
    let paramIndex = 2;

    if (filters.categoryId) {
      conditions.push(`l.category_id = $${paramIndex++}`);
      values.push(filters.categoryId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await this.db.unsafe<SearchRow[]>(
      `SELECT
        l.id,
        l.title,
        l.estimated_value,
        l.category_id,
        li.thumbnail_url,
        COUNT(*) OVER() AS count
       FROM lots l
       LEFT JOIN lot_images li ON li.lot_id = l.id AND li.is_primary = TRUE
       ${where}
       ORDER BY ts_rank(l.search_vector, plainto_tsquery('english', $1)) DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    const total = rows.length > 0 ? Number(rows[0].count) : 0;
    const items: LotSearchResult[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      estimatedValue: row.estimated_value !== null ? Number(row.estimated_value) : null,
      categoryId: row.category_id,
    }));

    return { items, total };
  }
}
