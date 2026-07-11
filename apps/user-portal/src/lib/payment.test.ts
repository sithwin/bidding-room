import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import {
  invoiceResponseSchema,
  checkoutResponseSchema,
  setupIntentResponseSchema,
  paymentProfileResponseSchema,
} from '@carat-room/shared-types';
import {
  parseInvoice,
  parseCheckout,
  parseSetupIntent,
  parsePaymentProfile,
  parsePaySavedCard,
} from './payment';

const invoiceFixture = {
  data: {
    id: 'invoice-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 1200,
    currency: 'AUD',
    status: 'AWAITING_PAYMENT',
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: '2026-07-20T00:00:00.000Z',
    paidAt: null,
    createdAt: '2026-07-11T00:00:00.000Z',
  },
} satisfies z.infer<typeof invoiceResponseSchema>;

const checkoutFixture = {
  data: { checkoutUrl: 'https://checkout.stripe.com/session/abc' },
} satisfies z.infer<typeof checkoutResponseSchema>;

const setupIntentFixture = {
  clientSecret: 'seti_secret',
} satisfies z.infer<typeof setupIntentResponseSchema>;

const paymentProfileFixture = {
  stripePaymentMethodId: 'pm_123',
  hasCard: true,
  last4: '4242',
  brand: 'visa',
} satisfies z.infer<typeof paymentProfileResponseSchema>;

afterEach(() => vi.restoreAllMocks());

describe('parseInvoice', () => {
  it('parses the real { data } envelope', () => {
    const result = parseInvoice(invoiceFixture);
    expect(result?.id).toBe('invoice-1');
    expect(result?.status).toBe('AWAITING_PAYMENT');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseInvoice({ id: 'invoice-1' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseCheckout', () => {
  it('parses the real { data: { checkoutUrl } } envelope', () => {
    const result = parseCheckout(checkoutFixture);
    expect(result).toBe('https://checkout.stripe.com/session/abc');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseCheckout({ checkoutUrl: 'https://checkout.stripe.com/session/abc' });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parseSetupIntent', () => {
  it('parses the bare { clientSecret } shape (documented deviation, no envelope)', () => {
    const result = parseSetupIntent(setupIntentFixture);
    expect(result).toBe('seti_secret');
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parseSetupIntent({ data: { clientSecret: 'seti_secret' } });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parsePaymentProfile', () => {
  it('parses the bare discriminated-union shape (documented deviation, no envelope)', () => {
    const result = parsePaymentProfile(paymentProfileFixture);
    expect(result?.hasCard).toBe(true);
  });

  it('returns null and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parsePaymentProfile({ data: paymentProfileFixture });
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('parsePaySavedCard', () => {
  it('returns true only for the bare { status: "paid" } shape', () => {
    const result = parsePaySavedCard({ status: 'paid' });
    expect(result).toBe(true);
  });

  it('returns false and logs on a drifted shape, never throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = parsePaySavedCard({ error: 'card declined' });
    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
