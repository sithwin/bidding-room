import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { StripeAdapter } from './stripe-adapter';

vi.mock('stripe');

describe('StripeAdapter', () => {
  let mockStripe: {
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  };
  let adapter: StripeAdapter;

  beforeEach(() => {
    mockStripe = {
      checkout: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    };
    vi.mocked(Stripe).mockImplementation(() => mockStripe as unknown as Stripe);
    adapter = new StripeAdapter('sk_test_abc', 'whsec_test');
  });

  it('should_returnCheckoutSession_when_created', async () => {
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });

    const result = await adapter.createCheckoutSession({
      invoiceId: 'inv-1',
      amount: 500.00,
      currency: 'aud',
      lotTitle: 'Sapphire Ring',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result).toEqual({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' });
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { invoiceId: 'inv-1' } }),
    );
  });

  it('should_constructWebhookEvent_with_rawBodyAndSignature', () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: {} },
    });

    const result = adapter.constructWebhookEvent(Buffer.from('{}'), 'sig_test');

    expect(result.id).toBe('evt_abc');
    expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
      Buffer.from('{}'),
      'sig_test',
      'whsec_test',
    );
  });
});
