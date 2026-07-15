import type { z } from 'zod';
import {
  type AuctionLotStatus, type AccountBid,
  lotStatusResponseSchema, placeBidResponseSchema,
  accountBidsResponseSchema, accountStatsResponseSchema,
} from '@carat-room/shared-types';

// Consumer-side contract boundary for the auction-engine: every response is
// parsed through the shared schema. Drift logs and degrades to the fallback —
// pages render without live-bid data, never crash. List/bid-history parsers
// are deliberately absent: no user-portal consumer exists (updates arrive via SSE).

export function parseLotStatus(json: unknown): AuctionLotStatus | null {
  const parsed = lotStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Auction lot status failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

export function parsePlacedBid(json: unknown): { bidId: string; amount: number; lotId: string } | null {
  const parsed = placeBidResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Place-bid response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

// GET /api/account/bids — { data: AccountBid[], meta } envelope. auction-engine
// owns bidding state only, so lotTitle/imageUrl/currency are never present here;
// callers must render around their absence rather than assume them.
export function parseAccountBids(json: unknown): AccountBid[] | null {
  const parsed = accountBidsResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Account bids response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

// AccountBid.status is the lot's lifecycle state (SCHEDULED/LIVE/CLOSING/SOLD/
// UNSOLD/CANCELLED); the UI badge instead shows the user's own standing on that
// lot. Closed lots (won or not) read as 'closed' — isWinning still tells the
// caller whether the closed lot was won, for callers that want a distinct label.
const CLOSED_LOT_STATUSES: ReadonlySet<AuctionLotStatus['status']> = new Set(['SOLD', 'UNSOLD', 'CANCELLED']);

export function deriveBidBadgeStatus(bid: Pick<AccountBid, 'status' | 'isWinning'>): 'leading' | 'outbid' | 'closed' {
  if (CLOSED_LOT_STATUSES.has(bid.status)) return 'closed';
  return bid.isWinning ? 'leading' : 'outbid';
}

export type AccountStats = z.infer<typeof accountStatsResponseSchema>['data'];

// GET /api/account/stats — { data: {...} } envelope. No `watching` field: that
// is catalogue's watchlist count and auction-engine has no data source for it.
export function parseAccountStats(json: unknown): AccountStats | null {
  const parsed = accountStatsResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Account stats response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}
