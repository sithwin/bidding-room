import { Hono } from 'hono';
import { Db } from '../infrastructure/db';

export function buildFacetsRouter(db: Db): Hono {
  const router = new Hono();

  router.get('/api/lots/facets', async c => {
    const { q, auctionId, minPrice, maxPrice } = c.req.query();

    // Build WHERE clause for department counts — mirrors lot search filters
    const conditions: string[] = ['department IS NOT NULL'];
    const values: (string | number)[] = [];
    let i = 1;

    if (q) {
      conditions.push(`search_vector @@ plainto_tsquery('english', $${i++})`);
      values.push(q);
    }
    if (auctionId) {
      conditions.push(`auction_id = $${i++}`);
      values.push(auctionId);
    }
    if (minPrice) {
      conditions.push(`estimated_value >= $${i++}`);
      values.push(Number(minPrice));
    }
    if (maxPrice) {
      conditions.push(`estimated_value <= $${i++}`);
      values.push(Number(maxPrice));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Department counts — filtered by the same criteria as lot search
    const departmentRows = await db.unsafe<{ department: string; count: string }[]>(
      `SELECT department, COUNT(*) AS count FROM lots ${where} GROUP BY department ORDER BY department ASC`,
      values,
    );

    // All open auctions — for the Auction filter dropdown
    const auctionRows = await db.unsafe<{ id: string; title: string }[]>(
      `SELECT id, title FROM auctions WHERE status = 'open' ORDER BY sale_date ASC`,
      [],
    );

    return c.json({
      departments: departmentRows.map(r => ({ name: r.department, count: Number(r.count) })),
      auctions: auctionRows.map(r => ({ id: r.id, title: r.title })),
    });
  });

  return router;
}
