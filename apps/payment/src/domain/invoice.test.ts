import { describe, it, expect } from 'vitest';
import { Invoice, InvoiceStatus } from './invoice';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 1500.00,
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

describe('Invoice', () => {
  it('should_returnTrue_when_isOwnedByMatchesWinnerUserId', () => {
    const invoice = buildInvoice({ winnerUserId: 'user-abc' });

    const result = invoice.isOwnedBy('user-abc');

    expect(result).toBe(true);
  });

  it('should_returnFalse_when_isOwnedByDoesNotMatchWinnerUserId', () => {
    const invoice = buildInvoice({ winnerUserId: 'user-abc' });

    const result = invoice.isOwnedBy('user-xyz');

    expect(result).toBe(false);
  });

  it('should_returnTrue_when_statusIsAwaitingPayment', () => {
    const invoice = buildInvoice({ status: InvoiceStatus.AwaitingPayment });

    expect(invoice.isAwaitingPayment()).toBe(true);
  });

  it('should_returnFalse_when_statusIsPaid', () => {
    const invoice = buildInvoice({ status: InvoiceStatus.Paid });

    expect(invoice.isAwaitingPayment()).toBe(false);
  });
});
