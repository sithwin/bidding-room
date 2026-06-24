import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

interface Input {
  userId: string;
  setupIntentId: string;
}

export class ConfirmSetupIntentUseCase {
  constructor(
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
  ) {}

  async execute(input: Input): Promise<{ ok: true }> {
    const intent = await this.stripe.retrieveSetupIntent(input.setupIntentId);
    if (intent.status !== 'succeeded') {
      throw new Error('SetupIntent has not succeeded');
    }
    if (!intent.paymentMethodId) {
      throw new Error('No payment method attached to SetupIntent');
    }

    const existing = await this.profiles.findByUserId(input.userId);
    await this.profiles.save({
      userId: input.userId,
      stripeCustomerId: existing?.stripeCustomerId ?? intent.customerId,
      stripePaymentMethodId: intent.paymentMethodId,
    });

    return { ok: true };
  }
}
