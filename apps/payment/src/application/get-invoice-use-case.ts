import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';

export class GetInvoiceUseCase {
  constructor(private readonly invoiceRepository: InvoiceRepository) {}

  async execute(params: { invoiceId: string; requestingUserId: string }): Promise<Invoice | null> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isOwnedBy(params.requestingUserId)) {
      return null;
    }
    return invoice;
  }
}
