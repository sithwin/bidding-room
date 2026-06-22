import { describe, it, expect, afterEach } from 'vitest';
import { createDb } from './db';
import { PostgresInvoiceRepository } from './postgres-invoice-repository';
import { Invoice, InvoiceStatus } from '../domain/invoice';

const db = createDb(process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_payment_test');
const repo = new PostgresInvoiceRepository(db);

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: 'inv-test-1',
    lotId: 'lot-1',
    winnerUserId: 'user-1',
    amount: 500.00,
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

afterEach(async () => {
  await db`DELETE FROM payment_events`;
  await db`DELETE FROM invoices`;
});

describe('PostgresInvoiceRepository', () => {
  it('should_saveAndFindById_when_invoiceSaved', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);

    const found = await repo.findById('inv-test-1');

    expect(found).not.toBeNull();
    expect(found!.id).toBe('inv-test-1');
    expect(found!.amount).toBe(500.00);
    expect(found!.status).toBe(InvoiceStatus.AwaitingPayment);
  });

  it('should_returnNull_when_invoiceNotFound', async () => {
    const found = await repo.findById('does-not-exist');

    expect(found).toBeNull();
  });

  it('should_findByLotId_when_invoiceExists', async () => {
    await repo.save(buildInvoice({ lotId: 'lot-xyz' }));

    const found = await repo.findByLotId('lot-xyz');

    expect(found).not.toBeNull();
    expect(found!.lotId).toBe('lot-xyz');
  });

  it('should_updateInvoiceStatus_when_savedWithNewStatus', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);

    const paidInvoice = new Invoice({
      ...invoice,
      status: InvoiceStatus.Paid,
      stripePaymentIntent: 'pi_test_abc',
      paidAt: new Date('2026-06-21T10:00:00Z'),
    });
    await repo.save(paidInvoice);

    const found = await repo.findById('inv-test-1');
    expect(found!.status).toBe(InvoiceStatus.Paid);
    expect(found!.stripePaymentIntent).toBe('pi_test_abc');
  });

  it('should_detectDuplicateStripeEvent_when_eventAlreadySaved', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);
    await repo.savePaymentEvent({
      invoiceId: 'inv-test-1',
      stripeEventId: 'evt_123',
      eventType: 'checkout.session.completed',
      payload: { test: true },
    });

    const isDuplicate = await repo.isPaymentEventProcessed('evt_123');

    expect(isDuplicate).toBe(true);
  });
});
