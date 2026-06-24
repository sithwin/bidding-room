import { Invoice, InvoiceStatus } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

type EventPublisher = (routingKey: string, payload: unknown) => Promise<void>;

interface Input {
  invoiceId: string;
  userId: string;
}

type Output = { status: 'paid' } | { error: string };

export class PaySavedCardUseCase {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
    private readonly publish: EventPublisher,
  ) {}

  async execute(input: Input): Promise<Output> {
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) return { error: 'Invoice not found' };
    if (!invoice.isOwnedBy(input.userId)) return { error: 'Forbidden' };
    if (!invoice.isAwaitingPayment()) return { error: 'Invoice is not awaiting payment' };

    const profile = await this.profiles.findByUserId(input.userId);
    if (!profile?.stripePaymentMethodId) return { error: 'No saved payment method' };

    const { status, paymentIntentId } = await this.stripe.chargePaymentMethod({
      customerId: profile.stripeCustomerId,
      paymentMethodId: profile.stripePaymentMethodId,
      amount: invoice.amount,
      currency: invoice.currency,
      description: `Invoice ${invoice.id} — lot ${invoice.lotId}`,
    });

    if (status !== 'succeeded') return { error: 'Card declined' };

    const paidInvoice = new Invoice({
      ...invoice,
      status: InvoiceStatus.Paid,
      stripePaymentIntent: paymentIntentId,
      paidAt: new Date(),
    });

    await this.invoices.save(paidInvoice);
    await this.publish('payment.received', {
      invoiceId: paidInvoice.id,
      lotId: paidInvoice.lotId,
      winnerUserId: paidInvoice.winnerUserId,
      amount: paidInvoice.amount,
      currency: paidInvoice.currency,
      paidAt: paidInvoice.paidAt!.toISOString(),
    });

    return { status: 'paid' };
  }
}
