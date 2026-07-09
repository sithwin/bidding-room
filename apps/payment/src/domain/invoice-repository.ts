import { Invoice } from './invoice';

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  findAll(filter: { status?: string }): Promise<Invoice[]>;
  findByLotId(lotId: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<void>;
  isPaymentEventProcessed(stripeEventId: string): Promise<boolean>;
  savePaymentEvent(params: {
    invoiceId: string;
    stripeEventId: string;
    eventType: string;
    payload: unknown;
  }): Promise<void>;
  sumPaidAmountByCurrency(): Promise<Record<string, number>>;
}
