import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';
import { ExpiryScheduler } from './expiry-scheduler';
import { GetInvoiceUseCase } from './get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from './create-checkout-session-use-case';
import { HandleWebhookUseCase } from './handle-webhook-use-case';
import { CreateInvoiceUseCase } from './create-invoice-use-case';
import { ExpireInvoiceUseCase } from './expire-invoice-use-case';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
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
    ...overrides,
  });
}

const mockRepo: InvoiceRepository = {
  findById: vi.fn(),
  findByLotId: vi.fn(),
  save: vi.fn(),
  isPaymentEventProcessed: vi.fn(),
  savePaymentEvent: vi.fn(),
};

const mockStripe: StripeClient = {
  createCheckoutSession: vi.fn(),
  constructWebhookEvent: vi.fn(),
};

const mockScheduler: ExpiryScheduler = {
  scheduleExpiry: vi.fn(),
  cancelExpiry: vi.fn(),
};

const mockPublish = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GetInvoiceUseCase', () => {
  it('should_returnInvoice_when_userOwnsIt', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new GetInvoiceUseCase(mockRepo);

    const result = await useCase.execute({ invoiceId: 'inv-1', requestingUserId: 'user-1' });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('inv-1');
  });

  it('should_returnNull_when_userDoesNotOwnInvoice', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice({ winnerUserId: 'user-1' }));
    const useCase = new GetInvoiceUseCase(mockRepo);

    const result = await useCase.execute({ invoiceId: 'inv-1', requestingUserId: 'user-other' });

    expect(result).toBeNull();
  });
});

describe('CreateCheckoutSessionUseCase', () => {
  it('should_createStripeSessionAndSaveCheckoutId_when_invoiceIsAwaitingPayment', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    vi.mocked(mockStripe.createCheckoutSession).mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });
    const useCase = new CreateCheckoutSessionUseCase(mockRepo, mockStripe, 'https://example.com');

    const result = await useCase.execute({
      invoiceId: 'inv-1',
      requestingUserId: 'user-1',
      lotTitle: 'Gold Ring',
    });

    expect(result).toEqual({ checkoutUrl: 'https://checkout.stripe.com/test' });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCheckoutId: 'cs_test_123' }),
    );
  });
});

describe('HandleWebhookUseCase', () => {
  it('should_markInvoicePaid_when_checkoutSessionCompleted', async () => {
    vi.mocked(mockStripe.constructWebhookEvent).mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: { metadata: { invoiceId: 'inv-1' }, payment_intent: 'pi_test' } },
    });
    vi.mocked(mockRepo.isPaymentEventProcessed).mockResolvedValue(false);
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new HandleWebhookUseCase(mockRepo, mockStripe, mockPublish, mockScheduler);

    await useCase.execute({ rawBody: Buffer.from('{}'), signature: 'sig_test' });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.Paid }),
    );
    expect(mockPublish).toHaveBeenCalledWith('payment.received', expect.any(Object));
  });

  it('should_skipProcessing_when_stripeEventAlreadyProcessed', async () => {
    vi.mocked(mockStripe.constructWebhookEvent).mockReturnValue({
      id: 'evt_abc',
      type: 'checkout.session.completed',
      data: { object: { metadata: { invoiceId: 'inv-1' }, payment_intent: 'pi_test' } },
    });
    vi.mocked(mockRepo.isPaymentEventProcessed).mockResolvedValue(true);
    const useCase = new HandleWebhookUseCase(mockRepo, mockStripe, mockPublish, mockScheduler);

    await useCase.execute({ rawBody: Buffer.from('{}'), signature: 'sig_test' });

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});

describe('CreateInvoiceUseCase', () => {
  it('should_createInvoiceAndScheduleExpiry_when_auctionClosedWithWinner', async () => {
    vi.mocked(mockRepo.findByLotId).mockResolvedValue(null);
    const useCase = new CreateInvoiceUseCase(mockRepo, mockScheduler, mockPublish, 72);

    await useCase.execute({
      lotId: 'lot-1',
      winnerUserId: 'user-1',
      amount: 800.00,
      currency: 'AUD',
    });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lotId: 'lot-1',
        winnerUserId: 'user-1',
        status: InvoiceStatus.AwaitingPayment,
      }),
    );
    expect(mockScheduler.scheduleExpiry).toHaveBeenCalled();
    expect(mockPublish).toHaveBeenCalledWith('payment.invoice.created', expect.any(Object));
  });
});

describe('ExpireInvoiceUseCase', () => {
  it('should_markExpiredAndPublish_when_invoiceIsStillAwaitingPayment', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(buildInvoice());
    const useCase = new ExpireInvoiceUseCase(mockRepo, mockPublish);

    await useCase.execute({ invoiceId: 'inv-1' });

    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.Expired }),
    );
    expect(mockPublish).toHaveBeenCalledWith('payment.invoice.expired', expect.any(Object));
  });
});
