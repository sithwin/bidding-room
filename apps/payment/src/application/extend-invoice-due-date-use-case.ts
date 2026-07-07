import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { ExpiryScheduler } from './expiry-scheduler';

export class ExtendInvoiceDueDateUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly expiryScheduler: ExpiryScheduler,
  ) {}

  async execute(params: { invoiceId: string; dueAt: string }): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (!invoice.isAwaitingPayment()) throw new Error('Only invoices awaiting payment can be extended');

    const newDueAt = new Date(params.dueAt);
    if (Number.isNaN(newDueAt.getTime()) || newDueAt <= invoice.dueAt) {
      throw new Error('New due date must be a valid date after the current due date');
    }

    const extended = new Invoice({ ...invoice, dueAt: newDueAt });
    await this.invoiceRepository.save(extended);
    await this.expiryScheduler.cancelExpiry(extended.id);
    await this.expiryScheduler.scheduleExpiry(extended.id, newDueAt);
    return extended;
  }
}
