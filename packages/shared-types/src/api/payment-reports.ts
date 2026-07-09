import { z } from 'zod';
import { envelope } from './envelope.js';

// ── Response schemas (match apps/payment/src/presentation/payment-router.ts exactly) ──

export const revenueReportSchema = z.object({
  byCurrency: z.record(z.string(), z.number()),
});

export const revenueReportResponseSchema = envelope(revenueReportSchema);

export type RevenueReport = z.infer<typeof revenueReportSchema>;
