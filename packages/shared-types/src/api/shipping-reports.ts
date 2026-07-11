import { z } from 'zod';
import { envelope } from './envelope.js';

// ── Response schemas (match apps/shipping/src/presentation/shipping-router.ts exactly) ──

export const pendingFulfilmentCountSchema = z.object({
  count: z.number(),
});

export const pendingFulfilmentCountResponseSchema = envelope(pendingFulfilmentCountSchema);

export type PendingFulfilmentCount = z.infer<typeof pendingFulfilmentCountSchema>;
