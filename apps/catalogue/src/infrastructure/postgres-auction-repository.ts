import { Auction, AuctionStatus } from '../domain/auction';
import { AuctionListItem, AuctionRepository } from '../domain/auction-repository';
import { Db } from './db';

interface AuctionRow {
  id: string;
  title: string;
  sale_date: Date | null;
  location: string | null;
  viewing_dates: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function rowToAuction(row: AuctionRow): Auction {
  return new Auction({
    id: row.id,
    title: row.title,
    saleDate: row.sale_date,
    location: row.location,
    viewingDates: row.viewing_dates,
    status: row.status as AuctionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class PostgresAuctionRepository implements AuctionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Auction | null> {
    const rows = await this.db<AuctionRow[]>`
      SELECT id, title, sale_date, location, viewing_dates, status, created_at, updated_at
      FROM auctions
      WHERE id = ${id}
    `;
    if (rows.length === 0) {
      return null;
    }
    return rowToAuction(rows[0]);
  }

  async findAll(status: AuctionStatus | undefined, limit: number): Promise<AuctionListItem[]> {
    const rows = await this.db.unsafe<(AuctionRow & { lot_count: string })[]>(
      `SELECT a.id, a.title, a.sale_date, a.location, a.viewing_dates, a.status,
              a.created_at, a.updated_at, COUNT(l.id) AS lot_count
       FROM auctions a
       LEFT JOIN lots l ON l.auction_id = a.id
       ${status ? 'WHERE a.status = $2' : ''}
       GROUP BY a.id
       ORDER BY a.sale_date ASC NULLS LAST
       LIMIT $1`,
      status ? [limit, status] : [limit],
    );
    return rows.map(row => ({ auction: rowToAuction(row), lotCount: Number(row.lot_count) }));
  }

  async save(auction: Auction): Promise<void> {
    await this.db`
      INSERT INTO auctions (id, title, sale_date, location, viewing_dates, status, created_at, updated_at)
      VALUES (
        ${auction.id}, ${auction.title}, ${auction.saleDate}, ${auction.location},
        ${auction.viewingDates}, ${auction.status}, ${auction.createdAt}, ${auction.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        title          = EXCLUDED.title,
        sale_date      = EXCLUDED.sale_date,
        location       = EXCLUDED.location,
        viewing_dates  = EXCLUDED.viewing_dates,
        status         = EXCLUDED.status,
        updated_at     = EXCLUDED.updated_at
    `;
  }
}
