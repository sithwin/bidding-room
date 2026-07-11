import {
  invoiceResponseSchema,
  checkoutResponseSchema,
  setupIntentResponseSchema,
  paymentProfileResponseSchema,
  paySavedCardResponseSchema,
  type PaymentInvoice,
  type PaymentProfile,
} from '@carat-room/shared-types';

// Contract boundary: every payment-service response is parsed through the
// shared schema. Drift logs and degrades to the fallback — pages never crash
// on a malformed response.
//
// Documented deviations (see packages/shared-types/src/api/payment.ts):
// setup-intent and profile responses are bare shapes, not { data } envelopes.

export function parseInvoice(json: unknown): PaymentInvoice | null {
  const parsed = invoiceResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Invoice response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

/** Returns the Stripe Checkout redirect URL. */
export function parseCheckout(json: unknown): string | null {
  const parsed = checkoutResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Checkout response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data.checkoutUrl;
}

/** Returns the SetupIntent client secret. Bare shape — no envelope. */
export function parseSetupIntent(json: unknown): string | null {
  const parsed = setupIntentResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Setup-intent response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.clientSecret;
}

/** Bare discriminated union — no envelope. */
export function parsePaymentProfile(json: unknown): PaymentProfile | null {
  const parsed = paymentProfileResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Payment-profile response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data;
}

/** Returns true only for the bare { status: 'paid' } shape. */
export function parsePaySavedCard(json: unknown): boolean {
  const parsed = paySavedCardResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Pay-saved-card response failed contract validation', parsed.error.issues);
    return false;
  }
  return true;
}
