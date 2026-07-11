import { InvoiceRepository } from '../domain/invoice-repository';

export interface PendingInvoiceCount {
  count: number;
}

export class GetPendingInvoiceCountUseCase {
  constructor(private readonly invoiceRepo: Pick<InvoiceRepository, 'countAwaitingPayment'>) {}

  async execute(): Promise<PendingInvoiceCount> {
    return { count: await this.invoiceRepo.countAwaitingPayment() };
  }
}
