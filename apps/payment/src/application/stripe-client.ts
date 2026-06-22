export interface CheckoutSession {
  id: string;
  url: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeClient {
  createCheckoutSession(params: {
    invoiceId: string;
    amount: number;
    currency: string;
    lotTitle: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  constructWebhookEvent(payload: Buffer, signature: string): WebhookEvent;
}
