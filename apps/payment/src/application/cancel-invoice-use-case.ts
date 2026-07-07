import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { ExpiryScheduler } from './expiry-scheduler';

export class CancelInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly expiryScheduler: ExpiryScheduler,
  ) {}

  async execute(params: { invoiceId: string }): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.isAwaitingPayment()) throw new Error('Only invoices awaiting payment can be cancelled');

    const cancelled = new Invoice({ ...invoice, status: InvoiceStatus.Cancelled });
    await this.invoiceRepository.save(cancelled);
    await this.expiryScheduler.cancelExpiry(cancelled.id);
    return cancelled;
  }
}
