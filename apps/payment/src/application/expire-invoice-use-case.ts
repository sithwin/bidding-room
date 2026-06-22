import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class ExpireInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly publish: EventPublisher,
  ) {}

  async execute(params: { invoiceId: string }): Promise<void> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isAwaitingPayment()) {
      return;
    }

    const expired = new Invoice({ ...invoice, status: InvoiceStatus.Expired });
    await this.invoiceRepository.save(expired);
    await this.publish('payment.invoice.expired', {
      invoiceId: expired.id,
      lotId: expired.lotId,
      winnerUserId: expired.winnerUserId,
    });
  }
}
