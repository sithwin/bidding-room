import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { PaySavedCardUseCase } from './pay-saved-card.use-case';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'u1',
    amount: 1000,
    currency: 'AUD',
    status: InvoiceStatus.AwaitingPayment,
    stripeCheckoutId: null,
    stripePaymentIntent: null,
    dueAt: new Date('2026-06-30T00:00:00Z'),
    paidAt: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    ...overrides,
  });
}

const mockInvoices = { findById: vi.fn(), findByLotId: vi.fn(), save: vi.fn(), isPaymentEventProcessed: vi.fn(), savePaymentEvent: vi.fn() };
const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = { chargePaymentMethod: vi.fn() };
const mockPublish = vi.fn();

describe('PaySavedCardUseCase', () => {
  let useCase: PaySavedCardUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new PaySavedCardUseCase(
      mockInvoices as never,
      mockProfiles as never,
      mockStripe as never,
      mockPublish,
    );
  });

  it('charges the saved card and marks invoice paid', async () => {
    mockInvoices.findById.mockResolvedValue(buildInvoice());
    mockProfiles.findByUserId.mockResolvedValue({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
    mockStripe.chargePaymentMethod.mockResolvedValue({ status: 'succeeded', paymentIntentId: 'pi_1' });
    mockInvoices.save.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(mockStripe.chargePaymentMethod).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_abc',
      paymentMethodId: 'pm_xyz',
      amount: 1000,
      currency: 'AUD',
    }));
    expect(mockInvoices.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: InvoiceStatus.Paid, stripePaymentIntent: 'pi_1' }),
    );
    expect(mockPublish).toHaveBeenCalledWith('payment.received', expect.objectContaining({
      invoiceId: 'inv-1',
    }));
    expect(result).toEqual({ status: 'paid' });
  });

  it('returns error when no saved payment method', async () => {
    mockInvoices.findById.mockResolvedValue(buildInvoice());
    mockProfiles.findByUserId.mockResolvedValue({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: null,
    });

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(result).toEqual({ error: 'No saved payment method' });
    expect(mockStripe.chargePaymentMethod).not.toHaveBeenCalled();
  });

  it('returns error when invoice not found', async () => {
    mockInvoices.findById.mockResolvedValue(null);

    const result = await useCase.execute({ invoiceId: 'inv-missing', userId: 'u1' });

    expect(result).toEqual({ error: 'Invoice not found' });
  });

  it('returns error when user does not own the invoice', async () => {
    mockInvoices.findById.mockResolvedValue(buildInvoice({ winnerUserId: 'other-user' }));
    mockProfiles.findByUserId.mockResolvedValue({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(result).toEqual({ error: 'Forbidden' });
  });

  it('returns error when invoice is not awaiting payment', async () => {
    mockInvoices.findById.mockResolvedValue(buildInvoice({ status: InvoiceStatus.Paid }));
    mockProfiles.findByUserId.mockResolvedValue({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(result).toEqual({ error: 'Invoice is not awaiting payment' });
  });

  it('returns error when card is declined', async () => {
    mockInvoices.findById.mockResolvedValue(buildInvoice());
    mockProfiles.findByUserId.mockResolvedValue({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
    mockStripe.chargePaymentMethod.mockResolvedValue({ status: 'requires_payment_method', paymentIntentId: 'pi_2' });

    const result = await useCase.execute({ invoiceId: 'inv-1', userId: 'u1' });

    expect(result).toEqual({ error: 'Card declined' });
    expect(mockInvoices.save).not.toHaveBeenCalled();
  });
});
