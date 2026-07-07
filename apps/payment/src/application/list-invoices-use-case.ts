import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';

export class ListInvoicesUseCase {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  async execute(params: { status?: string }): Promise<Invoice[]> {
    return this.invoiceRepository.findAll({ status: params.status });
  }
}
