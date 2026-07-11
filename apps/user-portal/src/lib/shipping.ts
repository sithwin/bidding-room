import { fulfilmentResponseSchema, fulfilmentSuccessResponseSchema, type ShippingFulfilment } from '@carat-room/shared-types';

// Contract boundary: every shipping-service response is parsed through the
// shared schema. Drift logs and degrades to the fallback — pages never crash
// on a malformed response.

export function parseFulfilment(json: unknown): ShippingFulfilment | null {
  const parsed = fulfilmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Fulfilment response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

/** Returns true only for the real { data: { success: true } } envelope. */
export function parseFulfilmentSuccess(json: unknown): boolean {
  const parsed = fulfilmentSuccessResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Fulfilment-success response failed contract validation', parsed.error.issues);
    return false;
  }
  return parsed.data.data.success;
}
