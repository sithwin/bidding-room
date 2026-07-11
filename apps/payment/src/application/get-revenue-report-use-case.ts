import { InvoiceRepository } from '../domain/invoice-repository';

export interface RevenueReport {
  byCurrency: Record<string, number>;
}

export class GetRevenueReportUseCase {
  constructor(private readonly invoiceRepo: Pick<InvoiceRepository, 'sumPaidAmountByCurrency'>) {}

  async execute(): Promise<RevenueReport> {
    return { byCurrency: await this.invoiceRepo.sumPaidAmountByCurrency() };
  }
}
