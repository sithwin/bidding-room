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
  createCustomer(userId: string, email: string): Promise<{ customerId: string }>;
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;
  retrieveSetupIntent(setupIntentId: string): Promise<{ status: string; customerId: string; paymentMethodId: string | null }>;
  chargePaymentMethod(params: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<{ status: string; paymentIntentId: string }>;
  retrievePaymentMethod(paymentMethodId: string): Promise<{ last4: string; brand: string }>;
}
