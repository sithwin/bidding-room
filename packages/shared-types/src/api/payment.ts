import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/payment/src/presentation/payment-router.ts (toInvoiceDto).
// Reality notes — documented deviations, not to be normalised:
//   POST /setup-intent            → bare { clientSecret }
//   POST /setup-intent/confirm    → bare { ok: true }; 422 error is { error: string }
//   POST /invoices/:id/pay-saved-card → bare { status: 'paid' }; 422 error is { error: string }
//   GET  /profile                 → bare union, discriminated on hasCard
// Invoice list has NO meta (repository caps at LIMIT 100 silently).

export const invoiceStatusSchema = z.enum(['AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED']);

export const invoiceSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  winnerUserId: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: invoiceStatusSchema,
  stripeCheckoutId: z.string().nullable(),
  stripePaymentIntent: z.string().nullable(),
  dueAt: z.string(),           // ISO-8601, non-null
  paidAt: z.string().nullable(),
  createdAt: z.string(),       // ISO-8601, non-null
});
export const invoiceResponseSchema = envelope(invoiceSchema);
export const invoiceListResponseSchema = z.object({ data: z.array(invoiceSchema) });

export const checkoutRequestSchema = z.object({ lotTitle: z.string() });
export const checkoutResponseSchema = envelope(z.object({ checkoutUrl: z.string() }));

export const extendInvoiceRequestSchema = z.object({ dueAt: z.string() });

export const setupIntentResponseSchema = z.object({ clientSecret: z.string() });
export const confirmSetupIntentRequestSchema = z.object({ setupIntentId: z.string() });
export const confirmSetupIntentResponseSchema = z.object({ ok: z.literal(true) });
export const paySavedCardResponseSchema = z.object({ status: z.literal('paid') });

export const paymentProfileResponseSchema = z.discriminatedUnion('hasCard', [
  z.object({ stripePaymentMethodId: z.null(), hasCard: z.literal(false) }),
  z.object({
    stripePaymentMethodId: z.string(),
    hasCard: z.literal(true),
    last4: z.string(),
    brand: z.string(),
  }),
]);

export type PaymentInvoice = z.infer<typeof invoiceSchema>;
export type PaymentProfile = z.infer<typeof paymentProfileResponseSchema>;

/** Query builder for GET /api/payments/invoices (admin). Router reads exactly status. */
export function invoicesQuery(params: { status?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  return query;
}
