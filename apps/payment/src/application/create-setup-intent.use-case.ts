import { PaymentProfileRepository } from './payment-profile-repository';
import { StripeClient } from './stripe-client';

interface Input {
  userId: string;
  email: string;
}

export class CreateSetupIntentUseCase {
  constructor(
    private readonly profiles: PaymentProfileRepository,
    private readonly stripe: StripeClient,
  ) {}

  async execute(input: Input): Promise<{ clientSecret: string }> {
    let profile = await this.profiles.findByUserId(input.userId);

    if (!profile) {
      const { customerId } = await this.stripe.createCustomer(input.userId, input.email);
      profile = { userId: input.userId, stripeCustomerId: customerId, stripePaymentMethodId: null };
      await this.profiles.save(profile);
    }

    return this.stripe.createSetupIntent(profile.stripeCustomerId);
  }
}
