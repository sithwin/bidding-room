import { z } from 'zod';
import { envelope } from './envelope.js';

// ── Response schemas (match apps/auction-engine/src/presentation/auction-router.ts exactly) ──

export const auctionResultRowSchema = z.object({
  lotId: z.string(),
  finalBid: z.number().nullable(),
  reserveMet: z.boolean(),
  winnerUserId: z.string().nullable(),
  closedAt: z.string(),
});

export const auctionResultsResponseSchema = envelope(z.array(auctionResultRowSchema));

export const unsoldLotRowSchema = z.object({
  lotId: z.string(),
  highestBid: z.number().nullable(),
});

export const unsoldLotsResponseSchema = envelope(z.array(unsoldLotRowSchema));

export type AuctionResultRow = z.infer<typeof auctionResultRowSchema>;
export type UnsoldLotRow = z.infer<typeof unsoldLotRowSchema>;
