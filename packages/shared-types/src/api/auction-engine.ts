import { z } from 'zod';
import { envelope } from './envelope.js';

// Transcribed from apps/auction-engine/src/presentation/auction-router.ts
// (serializeLotStatus and the bid-history mapping). List meta is { page, total }.
// SSE stream payloads are out of contract scope by design.
//
// Named AuctionLotStatus (not LotStatus) to avoid colliding with the domain
// LotStatus export in ./domain/auction.ts, which describes a wider shape.

export const auctionLotStatusValueSchema = z.enum([
  'SCHEDULED', 'LIVE', 'CLOSING', 'SOLD', 'UNSOLD', 'CANCELLED',
]);

export const auctionLotStatusSchema = z.object({
  lotId: z.string(),
  status: auctionLotStatusValueSchema,
  currentHighestBid: z.number().nullable(),
  bidCount: z.number(),
  endAt: z.string(), // ISO-8601 UTC
});

const pageMetaSchema = z.object({ page: z.number(), total: z.number() });

export const lotStatusResponseSchema = envelope(auctionLotStatusSchema);
export const lotStatusListResponseSchema = z.object({
  data: z.array(auctionLotStatusSchema),
  meta: pageMetaSchema,
});

export const auctionBidSchema = z.object({
  id: z.string(),
  userId: z.string().optional(), // serialised only for admin callers
  amount: z.number(),
  placedAt: z.string(), // ISO-8601 UTC
});
export const bidListResponseSchema = z.object({
  data: z.array(auctionBidSchema),
  meta: pageMetaSchema,
});

export const placeBidRequestSchema = z.object({ amount: z.number() });
export const placeBidResponseSchema = envelope(z.object({
  bidId: z.string(),
  amount: z.number(),
  lotId: z.string(),
}));

export const scheduleAuctionRequestSchema = z.object({
  lotId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  reservePrice: z.number().optional(),
  minBidIncrement: z.number().optional(),
  autoExtendWindowMinutes: z.number().optional(),
  autoExtendDurationMinutes: z.number().optional(),
});
export const scheduleAuctionResponseSchema = envelope(z.object({ lotId: z.string() }));

export const dashboardStatsResponseSchema = envelope(z.object({
  activeAuctions: z.number(),
  endingSoon: z.number(),
}));

// GET /api/account/bids — one row per lot the authenticated user has bid on,
// most recent bid first. lotTitle/imageUrl/currency are deliberately absent:
// auction-engine's read model has no catalogue data to draw them from.
export const accountBidSchema = z.object({
  lotId: z.string(),
  amount: z.number(),
  placedAt: z.string(), // ISO-8601 UTC — the user's own most recent bid on this lot
  isWinning: z.boolean(),
  currentHighestBid: z.number().nullable(),
  status: auctionLotStatusValueSchema,
  endAt: z.string(), // ISO-8601 UTC
});
export const accountBidsResponseSchema = z.object({
  data: z.array(accountBidSchema),
  meta: pageMetaSchema,
});

// GET /api/account/stats — counts derived from the bids/lot_status read model.
export const accountStatsResponseSchema = envelope(z.object({
  totalBids: z.number(),
  activeBids: z.number(),
  leadingBids: z.number(),
  lotsWon: z.number(),
}));

export type AuctionLotStatus = z.infer<typeof auctionLotStatusSchema>;
export type AuctionBid = z.infer<typeof auctionBidSchema>;
export type AccountBid = z.infer<typeof accountBidSchema>;

/** Query builder for GET /api/auctions. Router reads exactly page and pageSize. */
export function auctionsListQuery(params: { page?: number; pageSize?: number }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  return query;
}

/** Query builder for GET /api/auctions/:lotId/bids. Router reads exactly page and pageSize. */
export function bidHistoryQuery(params: { page?: number; pageSize?: number }): URLSearchParams {
  return auctionsListQuery(params);
}

/** Query builder for GET /api/account/bids. Router reads exactly page and pageSize. */
export function accountBidsQuery(params: { page?: number; pageSize?: number }): URLSearchParams {
  return auctionsListQuery(params);
}
