import {
  AuctionResultRow,
  BidRow,
  DashboardStats,
  LotQueryRepository,
  LotStatusRow,
  UnsoldLotRow,
  UserBidRow,
  UserStats,
} from '../application/lot-query-repository';
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
        SELECT id, user_id, amount, placed_at
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
        userId: r['user_id'] as string,
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

  async getDashboardStats(): Promise<DashboardStats> {
    const ENDING_SOON_STATUSES = ['LIVE', 'CLOSING'];
    const [activeRows, endingSoonRows] = await Promise.all([
      this.db`
        SELECT COUNT(*)::int AS count
        FROM lot_status
        WHERE status = ANY(${ACTIVE_STATUSES})
      `,
      this.db`
        SELECT COUNT(*)::int AS count
        FROM lot_status
        WHERE status = ANY(${ENDING_SOON_STATUSES})
          AND end_at <= NOW() + INTERVAL '24 hours'
      `,
    ]);
    return {
      activeAuctions: activeRows[0]['count'] as number,
      endingSoon: endingSoonRows[0]['count'] as number,
    };
  }

  async findClosedResults(from: Date, to: Date): Promise<AuctionResultRow[]> {
    const rows = await this.db`
      SELECT lot_id, status, current_highest_bid, winner_user_id, updated_at
      FROM lot_status
      WHERE status IN ('SOLD', 'UNSOLD')
        AND updated_at >= ${from}
        AND updated_at <= ${to}
      ORDER BY updated_at DESC
    `;
    return rows.map(r => ({
      lotId: r['lot_id'] as string,
      finalBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
      reserveMet: (r['status'] as string) === 'SOLD',
      winnerUserId: (r['winner_user_id'] as string | null) ?? null,
      closedAt: r['updated_at'] as Date,
    }));
  }

  async findUnsoldLots(): Promise<UnsoldLotRow[]> {
    const rows = await this.db`
      SELECT lot_id, current_highest_bid
      FROM lot_status
      WHERE status = 'UNSOLD'
      ORDER BY updated_at DESC
    `;
    return rows.map(r => ({
      lotId: r['lot_id'] as string,
      highestBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
    }));
  }

  async findBidderIds(lotId: string): Promise<string[]> {
    const rows = await this.db`
      SELECT DISTINCT user_id FROM bids WHERE lot_id = ${lotId}
    `;
    return rows.map(r => r['user_id'] as string);
  }

  async findBidsByUser(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ bids: UserBidRow[]; total: number }> {
    // One row per lot the user has bid on: their own highest bid on that lot,
    // plus the lot's current state. "isWinning" is derived from the leading
    // bid on the lot (highest amount, most recent on ties) belonging to this user —
    // lot_status only records winner_user_id once a lot has closed.
    const [rows, countRows] = await Promise.all([
      this.db`
        WITH my_bids AS (
          SELECT lot_id, MAX(amount) AS your_bid, MAX(placed_at) AS your_last_bid_at
          FROM bids
          WHERE user_id = ${userId}
          GROUP BY lot_id
        ),
        leading_bids AS (
          SELECT DISTINCT ON (lot_id) lot_id, user_id AS leading_user_id
          FROM bids
          ORDER BY lot_id, amount DESC, placed_at DESC
        )
        SELECT
          mb.lot_id,
          mb.your_bid,
          mb.your_last_bid_at,
          ls.current_highest_bid,
          ls.status,
          ls.end_at,
          (lb.leading_user_id = ${userId}) AS is_winning
        FROM my_bids mb
        JOIN lot_status ls ON ls.lot_id = mb.lot_id
        LEFT JOIN leading_bids lb ON lb.lot_id = mb.lot_id
        ORDER BY mb.your_last_bid_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      this.db`
        SELECT COUNT(DISTINCT lot_id)::int AS total FROM bids WHERE user_id = ${userId}
      `,
    ]);
    return {
      bids: rows.map(r => ({
        lotId: r['lot_id'] as string,
        amount: Number(r['your_bid']),
        placedAt: r['your_last_bid_at'] as Date,
        isWinning: r['is_winning'] === true,
        currentHighestBid: r['current_highest_bid'] != null ? Number(r['current_highest_bid']) : null,
        status: r['status'] as string,
        endAt: r['end_at'] as Date,
      })),
      total: countRows[0]['total'] as number,
    };
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const [totalBidsRows, activeBidsRows, leadingBidsRows, lotsWonRows] = await Promise.all([
      this.db`
        SELECT COUNT(*)::int AS count FROM bids WHERE user_id = ${userId}
      `,
      this.db`
        SELECT COUNT(DISTINCT b.lot_id)::int AS count
        FROM bids b
        JOIN lot_status ls ON ls.lot_id = b.lot_id
        WHERE b.user_id = ${userId} AND ls.status = ANY(${ACTIVE_STATUSES})
      `,
      this.db`
        WITH leading_bids AS (
          SELECT DISTINCT ON (lot_id) lot_id, user_id AS leading_user_id
          FROM bids
          ORDER BY lot_id, amount DESC, placed_at DESC
        )
        SELECT COUNT(*)::int AS count
        FROM leading_bids lb
        JOIN lot_status ls ON ls.lot_id = lb.lot_id
        WHERE lb.leading_user_id = ${userId} AND ls.status = ANY(${ACTIVE_STATUSES})
      `,
      this.db`
        SELECT COUNT(*)::int AS count
        FROM lot_status
        WHERE winner_user_id = ${userId} AND status = 'SOLD'
      `,
    ]);
    return {
      totalBids: totalBidsRows[0]['count'] as number,
      activeBids: activeBidsRows[0]['count'] as number,
      leadingBids: leadingBidsRows[0]['count'] as number,
      lotsWon: lotsWonRows[0]['count'] as number,
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
