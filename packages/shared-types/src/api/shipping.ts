import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/shipping/src/presentation/shipping-router.ts (toFulfilmentDto).
// Reality notes: no createdAt/updatedAt in any DTO; list endpoint has NO meta
// (repository caps at LIMIT 100); collection slot date is a plain string (SQL DATE).

export const fulfilmentStatusSchema = z.enum([
  'PENDING_CHOICE', 'PENDING_DISPATCH', 'DISPATCHED', 'COLLECTED',
]);
export const fulfilmentMethodSchema = z.enum(['SHIP', 'COLLECT']);

export const shippingAddressSchema = z.object({
  id: z.string(),
  fulfilmentId: z.string(),
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string().nullable(),
  postcode: z.string(),
  country: z.string(),
});

export const collectionSlotSchema = z.object({
  id: z.string(),
  fulfilmentId: z.string(),
  location: z.string(),
  date: z.string(),
  timeSlot: z.string(),
});

export const fulfilmentSchema = z.object({
  id: z.string(),
  lotId: z.string(),
  userId: z.string(),
  method: fulfilmentMethodSchema.nullable(),
  status: fulfilmentStatusSchema,
  shippingAddress: shippingAddressSchema.nullable(),
  collectionSlot: collectionSlotSchema.nullable(),
});

export const fulfilmentResponseSchema = envelope(fulfilmentSchema);
export const fulfilmentListResponseSchema = z.object({ data: z.array(fulfilmentSchema) });
export const pendingCountResponseSchema = envelope(z.object({ count: z.number() }));
export const fulfilmentSuccessResponseSchema = envelope(z.object({ success: z.literal(true) }));
export const fulfilmentIdResponseSchema = envelope(z.object({ id: z.string() }));

// Request bodies — exactly the fields the router destructures and validates.
export const chooseShipRequestSchema = z.object({
  fullName: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  postcode: z.string(),
  country: z.string(),
});
export const chooseCollectRequestSchema = z.object({
  location: z.string(),
  date: z.string(),
  timeSlot: z.string(),
});

// Named ShippingFulfilment (not Fulfilment) to avoid colliding with the domain
// `Fulfilment` type already exported from './domain/shipping.js' in index.ts —
// same convention as PaymentInvoice/AuctionLotStatus in the other api modules.
export type ShippingFulfilment = z.infer<typeof fulfilmentSchema>;
export type FulfilmentShippingAddress = z.infer<typeof shippingAddressSchema>;
export type FulfilmentCollectionSlot = z.infer<typeof collectionSlotSchema>;

/** Query builder for GET /api/shipping/fulfilments (admin). Router reads exactly status. */
export function fulfilmentsQuery(params: { status?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  return query;
}
