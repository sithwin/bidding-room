import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';
import { ExpiryScheduler } from './expiry-scheduler';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

export class HandleWebhookUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly stripeClient: StripeClient,
    private readonly publish: EventPublisher,
    private readonly expiryScheduler: ExpiryScheduler,
  ) {}

  async execute(params: { rawBody: Buffer; signature: string }): Promise<void> {
    const event = this.stripeClient.constructWebhookEvent(params.rawBody, params.signature);

    const isProcessed = await this.invoiceRepository.isPaymentEventProcessed(event.id);
    if (isProcessed) {
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        metadata: { invoiceId: string };
        payment_intent: string;
      };
      const invoiceId = session.metadata.invoiceId;

      const invoice = await this.invoiceRepository.findById(invoiceId);
      if (!invoice || !invoice.isAwaitingPayment()) {
        return;
      }

      const paidInvoice = new Invoice({
        ...invoice,
        status: InvoiceStatus.Paid,
        stripePaymentIntent: session.payment_intent,
        paidAt: new Date(),
      });

      await this.invoiceRepository.save(paidInvoice);
      await this.invoiceRepository.savePaymentEvent({
        invoiceId,
        stripeEventId: event.id,
        eventType: event.type,
        payload: event.data.object,
      });
      await this.expiryScheduler.cancelExpiry(invoiceId);
      await this.publish('payment.received', {
        invoiceId,
        lotId: paidInvoice.lotId,
        winnerUserId: paidInvoice.winnerUserId,
        amount: paidInvoice.amount,
        currency: paidInvoice.currency,
        paidAt: paidInvoice.paidAt!.toISOString(),
      });
    }
  }
}
