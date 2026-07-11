import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { buildPaymentRouter } from './payment-router';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { GetInvoiceUseCase } from '../application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from '../application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook-use-case';
import { CreateSetupIntentUseCase } from '../application/create-setup-intent.use-case';
import { ConfirmSetupIntentUseCase } from '../application/confirm-setup-intent.use-case';
import { PaySavedCardUseCase } from '../application/pay-saved-card.use-case';
import { GetRevenueReportUseCase } from '../application/get-revenue-report-use-case';
import { GetPendingInvoiceCountUseCase } from '../application/get-pending-invoice-count-use-case';
import {
  revenueReportResponseSchema, pendingInvoiceCountResponseSchema, apiErrorSchema, stringErrorSchema,
  checkoutResponseSchema, confirmSetupIntentResponseSchema, invoiceListResponseSchema,
  invoiceResponseSchema, invoicesQuery, paymentProfileResponseSchema,
  paySavedCardResponseSchema, setupIntentResponseSchema,
} from '@carat-room/shared-types';

let currentRole = 'BUYER';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: vi.fn().mockImplementation(
    (_key: string, options?: { adminOnly?: boolean }) =>
      async (
        c: { set: (k: string, v: unknown) => void; json: (body: unknown, status: number) => unknown },
        next: () => Promise<void>,
      ) => {
        if (options?.adminOnly && currentRole !== 'ADMIN') {
          return c.json({ error: { code: 'FORBIDDEN', message: 'Admins only' } }, 403);
        }
        c.set('jwtPayload', {
          userId: 'user-1',
          role: currentRole,
          email: 'test@example.com',
          verificationStatus: 'APPROVED_BIDDER',
        });
        await next();
        return undefined;
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
const mockListInvoices = { execute: vi.fn() };
const mockCancelInvoice = { execute: vi.fn() };
const mockExtendInvoiceDueDate = { execute: vi.fn() };
const mockInvoiceRepo = { findById: vi.fn() };
const mockCreateCheckout = { execute: vi.fn() } as unknown as CreateCheckoutSessionUseCase;
const mockHandleWebhook = { execute: vi.fn() } as unknown as HandleWebhookUseCase;
const mockCreateSetupIntent = { execute: vi.fn() } as unknown as CreateSetupIntentUseCase;
const mockConfirmSetupIntent = { execute: vi.fn() } as unknown as ConfirmSetupIntentUseCase;
const mockPaySavedCard = { execute: vi.fn() } as unknown as PaySavedCardUseCase;
const mockGetRevenueReport = { execute: vi.fn() } as unknown as GetRevenueReportUseCase;
const mockGetPendingInvoiceCount = { execute: vi.fn() } as unknown as GetPendingInvoiceCountUseCase;
const mockProfileRepo = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = { retrievePaymentMethod: vi.fn() };

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  currentRole = 'BUYER';
  app = new Hono().route('/', buildPaymentRouter({
    getInvoice: mockGetInvoice,
    listInvoices: mockListInvoices,
    cancelInvoice: mockCancelInvoice,
    extendInvoiceDueDate: mockExtendInvoiceDueDate,
    invoiceRepo: mockInvoiceRepo,
    createCheckoutSession: mockCreateCheckout,
    handleWebhook: mockHandleWebhook,
    createSetupIntent: mockCreateSetupIntent,
    confirmSetupIntent: mockConfirmSetupIntent,
    paySavedCard: mockPaySavedCard,
    getRevenueReport: mockGetRevenueReport,
    getPendingInvoiceCount: mockGetPendingInvoiceCount,
    profileRepo: mockProfileRepo as never,
    stripe: mockStripe,
    jwtPublicKey: 'test-public-key',
  }));
});

describe('GET /api/payments/reports/revenue', () => {
  it('should_return200WithByCurrency_when_adminRequests', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockGetRevenueReport.execute).mockResolvedValue({ byCurrency: { GBP: 1500 } });

    const res = await app.request('/api/payments/reports/revenue');

    expect(res.status).toBe(200);
    const body = revenueReportResponseSchema.parse(await res.json());
    expect(body.data.byCurrency['GBP']).toBe(1500);
  });

  it('should_return403_when_nonAdminRequests', async () => {
    currentRole = 'BUYER';

    const res = await app.request('/api/payments/reports/revenue');

    expect(res.status).toBe(403);
  });
});

describe('GET /api/payments/reports/pending-count', () => {
  it('should_return200WithCount_when_adminRequests', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockGetPendingInvoiceCount.execute).mockResolvedValue({ count: 3 });

    const res = await app.request('/api/payments/reports/pending-count');

    expect(res.status).toBe(200);
    const body = pendingInvoiceCountResponseSchema.parse(await res.json());
    expect(body.data.count).toBe(3);
  });

  it('should_return403_when_nonAdminRequests', async () => {
    currentRole = 'BUYER';

    const res = await app.request('/api/payments/reports/pending-count');

    expect(res.status).toBe(403);
  });
});

describe('GET /api/payments/invoices', () => {
  it('should_return200WithInvoiceList_when_adminRequests', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockListInvoices.execute).mockResolvedValue([buildInvoice()]);

    const res = await app.request(`/api/payments/invoices?${invoicesQuery({ status: 'PAID' })}`);

    expect(res.status).toBe(200);
    const body = invoiceListResponseSchema.parse(await res.json());
    expect(body.data[0].id).toBe('inv-1');
  });

  it('should_return403_when_nonAdminRequests', async () => {
    currentRole = 'BUYER';

    const res = await app.request(`/api/payments/invoices?${invoicesQuery({ status: 'PAID' })}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/payments/invoices/:id', () => {
  it('should_return200WithInvoice_when_userOwnsIt', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(buildInvoice());

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(200);
    const body = invoiceResponseSchema.parse(await res.json());
    expect(body.data.id).toBe('inv-1');
  });

  it('should_return404_when_invoiceNotFoundOrNotOwned', async () => {
    vi.mocked(mockGetInvoice.execute).mockResolvedValue(null);

    const res = await app.request('/api/payments/invoices/inv-1');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/payments/invoices/:id/extend', () => {
  it('should_return200WithInvoice_when_adminExtendsDueDate', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockExtendInvoiceDueDate.execute).mockResolvedValue(buildInvoice());

    const res = await app.request('/api/payments/invoices/inv-1/extend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-07-01T00:00:00Z' }),
    });

    expect(res.status).toBe(200);
    const body = invoiceResponseSchema.parse(await res.json());
    expect(body.data.id).toBe('inv-1');
  });

  it('should_return404_when_invoiceNotFound', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockExtendInvoiceDueDate.execute).mockRejectedValue(new Error('Invoice not found'));

    const res = await app.request('/api/payments/invoices/inv-1/extend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-07-01T00:00:00Z' }),
    });

    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.message).toBe('Invoice not found');
  });

  it('should_return409_when_extendConflicts', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockExtendInvoiceDueDate.execute).mockRejectedValue(new Error('Invoice already paid'));

    const res = await app.request('/api/payments/invoices/inv-1/extend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dueAt: '2026-07-01T00:00:00Z' }),
    });

    expect(res.status).toBe(409);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.message).toBe('Invoice already paid');
  });
});

describe('PATCH /api/payments/invoices/:id/cancel', () => {
  it('should_return200WithInvoice_when_adminCancels', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockCancelInvoice.execute).mockResolvedValue(buildInvoice());

    const res = await app.request('/api/payments/invoices/inv-1/cancel', { method: 'PATCH' });

    expect(res.status).toBe(200);
    const body = invoiceResponseSchema.parse(await res.json());
    expect(body.data.id).toBe('inv-1');
  });

  it('should_return404_when_invoiceNotFound', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockCancelInvoice.execute).mockRejectedValue(new Error('Invoice not found'));

    const res = await app.request('/api/payments/invoices/inv-1/cancel', { method: 'PATCH' });

    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.message).toBe('Invoice not found');
  });

  it('should_return409_when_cancelConflicts', async () => {
    currentRole = 'ADMIN';
    vi.mocked(mockCancelInvoice.execute).mockRejectedValue(new Error('Invoice already paid'));

    const res = await app.request('/api/payments/invoices/inv-1/cancel', { method: 'PATCH' });

    expect(res.status).toBe(409);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.message).toBe('Invoice already paid');
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
    const body = checkoutResponseSchema.parse(await res.json());
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

describe('POST /api/payments/setup-intent', () => {
  it('should_return200WithClientSecret_when_authenticated', async () => {
    vi.mocked(mockCreateSetupIntent.execute).mockResolvedValue({ clientSecret: 'seti_test_secret' });

    const res = await app.request('/api/payments/setup-intent', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = setupIntentResponseSchema.parse(await res.json());
    expect(body.clientSecret).toBe('seti_test_secret');
    expect(vi.mocked(mockCreateSetupIntent.execute)).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'test@example.com',
    });
  });
});

describe('POST /api/payments/setup-intent/confirm', () => {
  it('should_return200WithOk_when_setupIntentSucceeded', async () => {
    vi.mocked(mockConfirmSetupIntent.execute).mockResolvedValue({ ok: true });

    const res = await app.request('/api/payments/setup-intent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupIntentId: 'seti_1' }),
    });

    expect(res.status).toBe(200);
    const body = confirmSetupIntentResponseSchema.parse(await res.json());
    expect(body.ok).toBe(true);
    expect(vi.mocked(mockConfirmSetupIntent.execute)).toHaveBeenCalledWith({
      userId: 'user-1',
      setupIntentId: 'seti_1',
    });
  });

  it('should_return422_when_setupIntentHasNotSucceeded', async () => {
    vi.mocked(mockConfirmSetupIntent.execute).mockRejectedValue(new Error('SetupIntent has not succeeded'));

    const res = await app.request('/api/payments/setup-intent/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupIntentId: 'seti_1' }),
    });

    expect(res.status).toBe(422);
    const body = stringErrorSchema.parse(await res.json());
    expect(body.error).toBe('SetupIntent has not succeeded');
  });
});

describe('POST /api/payments/invoices/:id/pay-saved-card', () => {
  it('should_return200WithStatusPaid_when_cardCharged', async () => {
    vi.mocked(mockPaySavedCard.execute).mockResolvedValue({ status: 'paid' });

    const res = await app.request('/api/payments/invoices/inv-1/pay-saved-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = paySavedCardResponseSchema.parse(await res.json());
    expect(body.status).toBe('paid');
    expect(vi.mocked(mockPaySavedCard.execute)).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      userId: 'user-1',
    });
  });

  it('should_return422WithError_when_noSavedPaymentMethod', async () => {
    vi.mocked(mockPaySavedCard.execute).mockResolvedValue({ error: 'No saved payment method' });

    const res = await app.request('/api/payments/invoices/inv-1/pay-saved-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(422);
    const body = stringErrorSchema.parse(await res.json());
    expect(body.error).toBe('No saved payment method');
  });
});

describe('GET /api/payments/profile', () => {
  it('should_returnHasCardFalse_when_noSavedPaymentMethod', async () => {
    mockProfileRepo.findByUserId.mockResolvedValue(null);

    const res = await app.request('/api/payments/profile');

    expect(res.status).toBe(200);
    const body = paymentProfileResponseSchema.parse(await res.json());
    expect(body.hasCard).toBe(false);
  });

  it('should_returnHasCardTrueWithLast4AndBrand_when_savedPaymentMethodExists', async () => {
    mockProfileRepo.findByUserId.mockResolvedValue({
      userId: 'user-1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
    mockStripe.retrievePaymentMethod.mockResolvedValue({ last4: '4242', brand: 'visa' });

    const res = await app.request('/api/payments/profile');

    expect(res.status).toBe(200);
    const body = paymentProfileResponseSchema.parse(await res.json());
    expect(body.hasCard).toBe(true);
    const { last4, brand } = body as Extract<typeof body, { hasCard: true }>;
    expect(last4).toBe('4242');
    expect(brand).toBe('visa');
    expect(mockStripe.retrievePaymentMethod).toHaveBeenCalledWith('pm_xyz');
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
