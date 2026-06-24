import Stripe from 'stripe';
import { StripeClient, CheckoutSession, WebhookEvent } from '../application/stripe-client';

export class StripeAdapter implements StripeClient {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
  }

  async createCheckoutSession(params: {
    invoiceId: string;
    amount: number;
    currency: string;
    lotTitle: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: Math.round(params.amount * 100),
            product_data: { name: params.lotTitle },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { invoiceId: params.invoiceId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return { id: session.id, url: session.url! };
  }

  constructWebhookEvent(payload: Buffer, signature: string): WebhookEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    return {
      id: event.id,
      type: event.type,
      data: { object: event.data.object as Record<string, unknown> },
    };
  }

  async createCustomer(userId: string, email: string): Promise<{ customerId: string }> {
    const customer = await this.stripe.customers.create({
      email,
      metadata: { userId },
    });
    return { customerId: customer.id };
  }

  async createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
    const intent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    if (!intent.client_secret) throw new Error('Stripe did not return a client_secret');
    return { clientSecret: intent.client_secret };
  }

  async retrieveSetupIntent(setupIntentId: string): Promise<{ status: string; customerId: string; paymentMethodId: string | null }> {
    const intent = await this.stripe.setupIntents.retrieve(setupIntentId);
    return {
      status: intent.status ?? 'unknown',
      customerId: typeof intent.customer === 'string' ? intent.customer : intent.customer?.id ?? '',
      paymentMethodId: typeof intent.payment_method === 'string' ? intent.payment_method : null,
    };
  }

  async chargePaymentMethod(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<{ status: string; paymentIntentId: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      description: params.description,
      confirm: true,
      off_session: true,
    });
    return { status: intent.status, paymentIntentId: intent.id };
  }

  async retrievePaymentMethod(paymentMethodId: string): Promise<{ last4: string; brand: string }> {
    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    const card = pm.card;
    if (!card) throw new Error('Payment method has no card details');
    return { last4: card.last4, brand: card.brand };
  }
}
