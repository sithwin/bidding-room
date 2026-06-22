import { Invoice } from '../domain/invoice';
import { InvoiceRepository } from '../domain/invoice-repository';
import { StripeClient } from './stripe-client';

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly stripeClient: StripeClient,
    private readonly frontendUrl: string,
  ) {}

  async execute(params: {
    invoiceId: string;
    requestingUserId: string;
    lotTitle: string;
  }): Promise<{ checkoutUrl: string } | null> {
    const invoice = await this.invoiceRepository.findById(params.invoiceId);
    if (!invoice || !invoice.isOwnedBy(params.requestingUserId)) {
      return null;
    }
    if (!invoice.isAwaitingPayment()) {
      return null;
    }

    const session = await this.stripeClient.createCheckoutSession({
      invoiceId: invoice.id,
      amount: invoice.amount,
      currency: invoice.currency,
      lotTitle: params.lotTitle,
      successUrl: `${this.frontendUrl}/account/invoices/${invoice.id}?payment=success`,
      cancelUrl: `${this.frontendUrl}/account/invoices/${invoice.id}`,
    });

    const updated = new Invoice({ ...invoice, stripeCheckoutId: session.id });
    await this.invoiceRepository.save(updated);

    return { checkoutUrl: session.url };
  }
}
