import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createTestDb } from '@carat-room/test-db';
import { Db } from './db';
import { PostgresInvoiceRepository } from './postgres-invoice-repository';
import { Invoice, InvoiceStatus } from '../domain/invoice';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://localhost/carat_payment_test';
const db = createTestDb(TEST_DB_URL) as Db;
const repo = new PostgresInvoiceRepository(db);

afterAll(async () => {
  await db.end();
});

// invoices.id / lot_id / winner_user_id are UUID columns (see
// apps/payment/migrations/001_create_payment.sql) — fixtures must use valid
// UUID literals or postgres.js's parameter type inference rejects them.
const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const INVOICE_ID_2 = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID_3 = '33333333-3333-4333-8333-333333333333';
const INVOICE_ID_4 = '44444444-4444-4444-8444-444444444444';
const NONEXISTENT_ID = '99999999-9999-4999-8999-999999999999';
const LOT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOT_ID_XYZ = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function buildInvoice(overrides: Partial<ConstructorParameters<typeof Invoice>[0]> = {}): Invoice {
  return new Invoice({
    id: INVOICE_ID,
    lotId: LOT_ID,
    winnerUserId: USER_ID,
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

    const found = await repo.findById(INVOICE_ID);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(INVOICE_ID);
    expect(found!.amount).toBe(500.00);
    expect(found!.status).toBe(InvoiceStatus.AwaitingPayment);
  });

  it('should_returnNull_when_invoiceNotFound', async () => {
    const found = await repo.findById(NONEXISTENT_ID);

    expect(found).toBeNull();
  });

  it('should_findByLotId_when_invoiceExists', async () => {
    await repo.save(buildInvoice({ lotId: LOT_ID_XYZ }));

    const found = await repo.findByLotId(LOT_ID_XYZ);

    expect(found).not.toBeNull();
    expect(found!.lotId).toBe(LOT_ID_XYZ);
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

    const found = await repo.findById(INVOICE_ID);
    expect(found!.status).toBe(InvoiceStatus.Paid);
    expect(found!.stripePaymentIntent).toBe('pi_test_abc');
  });

  it('should_detectDuplicateStripeEvent_when_eventAlreadySaved', async () => {
    const invoice = buildInvoice();
    await repo.save(invoice);
    await repo.savePaymentEvent({
      invoiceId: INVOICE_ID,
      stripeEventId: 'evt_123',
      eventType: 'checkout.session.completed',
      payload: { test: true },
    });

    const isDuplicate = await repo.isPaymentEventProcessed('evt_123');

    expect(isDuplicate).toBe(true);
  });

  it('should_sumPaidInvoicesByCurrency_when_paidInvoicesExist', async () => {
    await repo.save(buildInvoice({ id: INVOICE_ID, currency: 'GBP', amount: 1000, status: InvoiceStatus.Paid }));
    await repo.save(buildInvoice({ id: INVOICE_ID_2, currency: 'GBP', amount: 500, status: InvoiceStatus.Paid }));
    await repo.save(buildInvoice({ id: INVOICE_ID_3, currency: 'USD', amount: 200, status: InvoiceStatus.Paid }));
    await repo.save(buildInvoice({ id: INVOICE_ID_4, currency: 'GBP', amount: 999, status: InvoiceStatus.AwaitingPayment }));

    const result = await repo.sumPaidAmountByCurrency();

    expect(result).toEqual({ GBP: 1500, USD: 200 });
  });

  it('should_returnEmptyObject_when_noPaidInvoicesExist', async () => {
    await repo.save(buildInvoice({ id: INVOICE_ID, status: InvoiceStatus.AwaitingPayment }));

    const result = await repo.sumPaidAmountByCurrency();

    expect(result).toEqual({});
  });

  it('should_countAwaitingPaymentInvoices_when_someInvoicesAwaitPayment', async () => {
    await repo.save(buildInvoice({ id: INVOICE_ID, status: InvoiceStatus.AwaitingPayment }));
    await repo.save(buildInvoice({ id: INVOICE_ID_2, lotId: LOT_ID_XYZ, status: InvoiceStatus.AwaitingPayment }));
    await repo.save(buildInvoice({ id: INVOICE_ID_3, status: InvoiceStatus.Paid }));

    const count = await repo.countAwaitingPayment();

    expect(count).toBe(2);
  });

  it('should_countZero_when_noInvoicesAwaitPayment', async () => {
    await repo.save(buildInvoice({ id: INVOICE_ID, status: InvoiceStatus.Paid }));

    const count = await repo.countAwaitingPayment();

    expect(count).toBe(0);
  });
});
