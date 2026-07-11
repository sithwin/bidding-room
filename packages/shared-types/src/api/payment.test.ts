import { describe, expect, it } from 'vitest';
import {
  invoiceResponseSchema,
  invoicesQuery,
  paymentProfileResponseSchema,
  paySavedCardResponseSchema,
  setupIntentResponseSchema,
} from './payment';

const invoiceFixture = {
  id: 'inv-1', lotId: 'lot-1', winnerUserId: 'u1', amount: 1200.5, currency: 'AUD',
  status: 'AWAITING_PAYMENT', stripeCheckoutId: null, stripePaymentIntent: null,
  dueAt: '2026-07-18T00:00:00.000Z', paidAt: null, createdAt: '2026-07-11T00:00:00.000Z',
};

describe('payment contract schemas', () => {
  it('parses an invoice envelope with nullable stripe fields and paidAt', () => {
    expect(invoiceResponseSchema.parse({ data: invoiceFixture }).data.paidAt).toBeNull();
  });

  it('rejects an invoice without the envelope', () => {
    expect(invoiceResponseSchema.safeParse(invoiceFixture).success).toBe(false);
  });

  it('parses the bare setup-intent response (documented envelope deviation)', () => {
    expect(setupIntentResponseSchema.parse({ clientSecret: 'seti_secret' }).clientSecret).toBe('seti_secret');
  });

  it('parses both payment-profile variants, discriminated on hasCard', () => {
    expect(paymentProfileResponseSchema.parse({ stripePaymentMethodId: null, hasCard: false }).hasCard).toBe(false);
    const withCard = paymentProfileResponseSchema.parse({
      stripePaymentMethodId: 'pm_1', hasCard: true, last4: '4242', brand: 'visa',
    });
    expect(withCard.hasCard === true && withCard.last4).toBe('4242');
  });

  it('parses the bare pay-saved-card success', () => {
    expect(paySavedCardResponseSchema.parse({ status: 'paid' }).status).toBe('paid');
  });
});

describe('invoicesQuery', () => {
  it('emits exactly the status param the router reads', () => {
    expect(invoicesQuery({ status: 'PAID' }).toString()).toBe('status=PAID');
    expect(invoicesQuery({}).toString()).toBe('');
  });
});
