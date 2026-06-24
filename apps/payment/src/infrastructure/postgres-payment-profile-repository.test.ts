import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresPaymentProfileRepository } from './postgres-payment-profile-repository';

// Mock the postgres.js tagged-template sql function.
// The sql tag is called as a function: sql`...` returns a promise that resolves to a row array.
const mockSql = vi.fn();

describe('PostgresPaymentProfileRepository', () => {
  let repo: PostgresPaymentProfileRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockReturnValue(Promise.resolve([]));
    repo = new PostgresPaymentProfileRepository(mockSql as any);
  });

  it('returns null when no profile is found', async () => {
    mockSql.mockReturnValue(Promise.resolve([]));

    const result = await repo.findByUserId('user-1');

    expect(result).toBeNull();
  });

  it('maps a database row to a PaymentProfile when found', async () => {
    mockSql.mockReturnValue(Promise.resolve([{
      user_id: 'user-1',
      stripe_customer_id: 'cus_abc',
      stripe_payment_method_id: 'pm_xyz',
      created_at: new Date(),
      updated_at: new Date(),
    }]));

    const result = await repo.findByUserId('user-1');

    expect(result).toEqual({
      userId: 'user-1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
  });

  it('maps a row with a null payment method to a PaymentProfile', async () => {
    mockSql.mockReturnValue(Promise.resolve([{
      user_id: 'user-1',
      stripe_customer_id: 'cus_abc',
      stripe_payment_method_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    }]));

    const result = await repo.findByUserId('user-1');

    expect(result).toEqual({
      userId: 'user-1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: null,
    });
  });

  it('calls the database once when saving a profile', async () => {
    mockSql.mockReturnValue(Promise.resolve([]));

    await repo.save({ userId: 'user-1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: 'pm_xyz' });

    expect(mockSql).toHaveBeenCalledOnce();
  });

  it('calls the database once when saving a profile with no payment method', async () => {
    mockSql.mockReturnValue(Promise.resolve([]));

    await repo.save({ userId: 'user-2', stripeCustomerId: 'cus_def', stripePaymentMethodId: null });

    expect(mockSql).toHaveBeenCalledOnce();
  });
});
