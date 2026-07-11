import {
  type AuctionLotStatus,
  lotStatusResponseSchema, placeBidResponseSchema,
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
