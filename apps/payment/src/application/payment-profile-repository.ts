export interface PaymentProfile {
  userId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string | null;
}

export interface PaymentProfileRepository {
  findByUserId(userId: string): Promise<PaymentProfile | null>;
  save(profile: PaymentProfile): Promise<void>;
}
