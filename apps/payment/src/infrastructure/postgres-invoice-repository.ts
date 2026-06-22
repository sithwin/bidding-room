import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { Db } from './db';

interface InvoiceRow {
  id: string;
  lot_id: string;
  winner_user_id: string;
  amount: string;
  currency: string;
  status: string;
  stripe_checkout_id: string | null;
  stripe_payment_intent: string | null;
  due_at: Date;
  paid_at: Date | null;
  created_at: Date;
}

function rowToInvoice(row: InvoiceRow): Invoice {
  return new Invoice({
    id: row.id,
    lotId: row.lot_id,
    winnerUserId: row.winner_user_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as InvoiceStatus,
    stripeCheckoutId: row.stripe_checkout_id,
    stripePaymentIntent: row.stripe_payment_intent,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  });
}

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<Invoice | null> {
    const rows = await this.db<InvoiceRow[]>`
      SELECT * FROM invoices WHERE id = ${id}
    `;
    return rows[0] ? rowToInvoice(rows[0]) : null;
  }

  async findByLotId(lotId: string): Promise<Invoice | null> {
    const rows = await this.db<InvoiceRow[]>`
      SELECT * FROM invoices WHERE lot_id = ${lotId}
    `;
    return rows[0] ? rowToInvoice(rows[0]) : null;
  }

  async save(invoice: Invoice): Promise<void> {
    await this.db`
      INSERT INTO invoices (
        id, lot_id, winner_user_id, amount, currency, status,
        stripe_checkout_id, stripe_payment_intent, due_at, paid_at, created_at
      ) VALUES (
        ${invoice.id}, ${invoice.lotId}, ${invoice.winnerUserId},
        ${invoice.amount}, ${invoice.currency}, ${invoice.status},
        ${invoice.stripeCheckoutId}, ${invoice.stripePaymentIntent},
        ${invoice.dueAt}, ${invoice.paidAt}, ${invoice.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        stripe_checkout_id = EXCLUDED.stripe_checkout_id,
        stripe_payment_intent = EXCLUDED.stripe_payment_intent,
        paid_at = EXCLUDED.paid_at
    `;
  }

  async isPaymentEventProcessed(stripeEventId: string): Promise<boolean> {
    const rows = await this.db`
      SELECT id FROM payment_events WHERE stripe_event_id = ${stripeEventId}
    `;
    return rows.length > 0;
  }

  async savePaymentEvent(params: {
    invoiceId: string;
    stripeEventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void> {
    await this.db`
      INSERT INTO payment_events (invoice_id, stripe_event_id, event_type, payload)
      VALUES (
        ${params.invoiceId},
        ${params.stripeEventId},
        ${params.eventType},
        ${this.db.json(params.payload as Record<string, unknown>)}
      )
    `;
  }
}
