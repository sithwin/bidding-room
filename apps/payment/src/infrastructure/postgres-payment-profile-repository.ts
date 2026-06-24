import { PaymentProfile, PaymentProfileRepository } from '../application/payment-profile-repository';
import { Db } from './db';

interface ProfileRow {
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string | null;
}

export class PostgresPaymentProfileRepository implements PaymentProfileRepository {
  constructor(private readonly db: Db) {}

  async findByUserId(userId: string): Promise<PaymentProfile | null> {
    const rows = await this.db<ProfileRow[]>`
      SELECT user_id, stripe_customer_id, stripe_payment_method_id
      FROM payment_profiles
      WHERE user_id = ${userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id,
      stripePaymentMethodId: row.stripe_payment_method_id,
    };
  }

  async save(profile: PaymentProfile): Promise<void> {
    await this.db`
      INSERT INTO payment_profiles (user_id, stripe_customer_id, stripe_payment_method_id, updated_at)
      VALUES (${profile.userId}, ${profile.stripeCustomerId}, ${profile.stripePaymentMethodId}, NOW())
      ON CONFLICT (user_id) DO UPDATE
        SET stripe_customer_id       = EXCLUDED.stripe_customer_id,
            stripe_payment_method_id = EXCLUDED.stripe_payment_method_id,
            updated_at               = EXCLUDED.updated_at
    `;
  }
}
