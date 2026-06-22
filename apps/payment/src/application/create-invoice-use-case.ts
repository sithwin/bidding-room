import { v4 as uuidv4 } from 'uuid';
import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { ExpiryScheduler } from './expiry-scheduler';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class CreateInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly expiryScheduler: ExpiryScheduler,
    private readonly publish: EventPublisher,
    private readonly paymentWindowHours: number,
  ) {}

  async execute(params: {
    lotId: string;
    winnerUserId: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    const existing = await this.invoiceRepository.findByLotId(params.lotId);
    if (existing) {
      return;
    }

    const now = new Date();
    const dueAt = new Date(now.getTime() + this.paymentWindowHours * 60 * 60 * 1000);

    const invoice = new Invoice({
      id: uuidv4(),
      lotId: params.lotId,
      winnerUserId: params.winnerUserId,
      amount: params.amount,
      currency: params.currency,
      status: InvoiceStatus.AwaitingPayment,
      stripeCheckoutId: null,
      stripePaymentIntent: null,
      dueAt,
      paidAt: null,
      createdAt: now,
    });

    await this.invoiceRepository.save(invoice);
    await this.expiryScheduler.scheduleExpiry(invoice.id, invoice.dueAt);
    await this.publish('payment.invoice.created', {
      invoiceId: invoice.id,
      lotId: invoice.lotId,
      winnerUserId: invoice.winnerUserId,
      amount: invoice.amount,
      currency: invoice.currency,
      dueAt: invoice.dueAt.toISOString(),
    });
  }
}
