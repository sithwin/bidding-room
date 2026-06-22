import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildPaymentRouter } from './payment-router';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { GetInvoiceUseCase } from '../application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from '../application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook-use-case';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: vi.fn().mockReturnValue(
    async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      c.set('jwtPayload', {
        userId: 'user-1',
        role: 'BUYER',
        email: 'test@example.com',
        verificationStatus: 'APPROVED_BIDDER',
      });
      await next();
    },
  ),
}));

function buildInvoice(): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 800.00,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-23T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
  });
}

const mockGetInvoice = { execute: vi.fn() } as unknown as GetInvoiceUseCase;
const mockCreateCheckout = { execute: vi.fn() } as unknown as CreateCheckoutSessionUseCase;
const mockHandleWebhook = { execute: vi.fn() } as unknown as HandleWebhookUseCase;

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = new Hono().route('/', buildPaymentRouter({
    getInvoice: mockGetInvoice,
    createCheckoutSession: mockCreateCheckout,
    handleWebhook: mockHandleWebhook,
    jwtPublicKey: 'test-public-key',
  }));
});

describe('GET /api/payments/invoices/:id', () => {
  it('should_return200WithInvoice_when_userOwnsIt', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(buildInvoice());

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string } };
    expect(body.data.id).toBe('inv-1');
  });

  it('should_return404_when_invoiceNotFoundOrNotOwned', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(null);

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/invoices/:id/checkout', () => {
  it('should_return200WithCheckoutUrl_when_successful', async () => {
    vi.mocked(mockCreateCheckout.execute).mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/test',
    });

    const res = await app.request('/api/payments/invoices/inv-1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotTitle: 'Gold Ring' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { checkoutUrl: string } };
    expect(body.data.checkoutUrl).toBe('https://checkout.stripe.com/test');
  });

  it('should_return404_when_invoiceNotFound', async () => {
    vi.mocked(mockCreateCheckout.execute).mockResolvedValue(null);

    const res = await app.request('/api/payments/invoices/inv-1/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotTitle: 'Gold Ring' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/webhooks/stripe', () => {
  it('should_return200_when_webhookProcessedSuccessfully', async () => {
    vi.mocked(mockHandleWebhook.execute).mockResolvedValue(undefined);

    const res = await app.request('/api/payments/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_test' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
  });

  it('should_return400_when_webhookSignatureInvalid', async () => {
    vi.mocked(mockHandleWebhook.execute).mockRejectedValue(
      new Error('No signatures found matching'),
    );

    const res = await app.request('/api/payments/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'bad_sig' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
