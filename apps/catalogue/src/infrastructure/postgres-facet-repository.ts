import { AuctionFacet, DepartmentFacet, FacetFilters, FacetRepository } from '../domain/facet-repository';
import { Db } from './db';

export class PostgresFacetRepository implements FacetRepository {
  constructor(private readonly db: Db) {}

  async countLotsByDepartment(filters: FacetFilters): Promise<DepartmentFacet[]> {
    // Mirrors the lot search filters so counts match the visible result set
    const conditions: string[] = ['department IS NOT NULL'];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (filters.query) {
      conditions.push(`search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
      values.push(filters.query);
    }
    if (filters.auctionId) {
      conditions.push(`auction_id = $${paramIndex++}`);
      values.push(filters.auctionId);
    }
    if (filters.minEstimatedValue !== undefined) {
      conditions.push(`estimated_value >= $${paramIndex++}`);
      values.push(filters.minEstimatedValue);
    }
    if (filters.maxEstimatedValue !== undefined) {
      conditions.push(`estimated_value <= $${paramIndex++}`);
      values.push(filters.maxEstimatedValue);
    }

    const rows = await this.db.unsafe<{ department: string; count: string }[]>(
      `SELECT department, COUNT(*) AS count FROM lots WHERE ${conditions.join(' AND ')} GROUP BY department ORDER BY department ASC`,
      values,
    );
    return rows.map(row => ({ name: row.department, count: Number(row.count) }));
  }

  async listOpenAuctions(): Promise<AuctionFacet[]> {
    const rows = await this.db<{ id: string; title: string }[]>`
      SELECT id, title FROM auctions WHERE status = 'open' ORDER BY sale_date ASC
    `;
    return rows.map(row => ({ id: row.id, title: row.title }));
  }
}
