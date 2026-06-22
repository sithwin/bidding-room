import { BidRow, LotQueryRepository, LotStatusRow } from '../application/lot-query-repository';
import { Db } from './db';

const ACTIVE_STATUSES = ['SCHEDULED', 'LIVE', 'CLOSING'];

export class PostgresLotQueryRepository implements LotQueryRepository {
  constructor(private readonly db: Db) {}

  async findLotStatus(lotId: string): Promise<LotStatusRow | null> {
    const rows = await this.db`
      SELECT lot_id, status, current_highest_bid, bid_count, end_at, winner_user_id, updated_at
      FROM lot_status
      WHERE lot_id = ${lotId}
    `;
    if (rows.length === 0) return null;
    return mapLotStatusRow(rows[0]);
  }

  async findBidHistory(
    lotId: string,
    limit: number,
    offset: number,
  ): Promise<{ bids: BidRow[]; total: number }> {
    const [rows, countRows] = await Promise.all([
      this.db`
        SELECT id, amount, placed_at
        FROM bids
        WHERE lot_id = ${lotId}
        ORDER BY placed_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.db`SELECT COUNT(*)::int AS total FROM bids WHERE lot_id = ${lotId}`,
    ]);
    return {
      bids: rows.map(r => ({
        id: r['id'] as string,
        amount: Number(r['amount']),
        placedAt: r['placed_at'] as Date,
      })),
      total: countRows[0]['total'] as number,
    };
  }

  async findActiveLots(
    limit: number,
    offset: number,
  ): Promise<{ lots: LotStatusRow[]; total: number }> {
    const [rows, countRows] = await Promise.all([
      this.db`
        SELECT lot_id, status, current_highest_bid, bid_count, end_at, winner_user_id, updated_at
        FROM lot_status
        WHERE status = ANY(${ACTIVE_STATUSES})
        ORDER BY end_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.db`
        SELECT COUNT(*)::int AS total
        FROM lot_status
        WHERE status = ANY(${ACTIVE_STATUSES})
      `,
    ]);
    return {
      lots: rows.map(mapLotStatusRow),
      total: countRows[0]['total'] as number,
    };
  }
}

function mapLotStatusRow(r: Record<string, unknown>): LotStatusRow {
  return {
    lotId: r['lot_id'] as string,
    status: r['status'] as string,
    currentHighestBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
    bidCount: r['bid_count'] as number,
    endAt: r['end_at'] as Date,
    winnerUserId: (r['winner_user_id'] as string | null) ?? null,
    updatedAt: r['updated_at'] as Date,
  };
}
