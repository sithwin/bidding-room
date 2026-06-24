import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateSetupIntentUseCase } from './create-setup-intent.use-case';

const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = {
  createCustomer: vi.fn(),
  createSetupIntent: vi.fn(),
};

describe('CreateSetupIntentUseCase', () => {
  let useCase: CreateSetupIntentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new CreateSetupIntentUseCase(mockProfiles as any, mockStripe as any);
  });

  it('creates a new Stripe customer if none exists then returns clientSecret', async () => {
    mockProfiles.findByUserId.mockResolvedValue(null);
    mockStripe.createCustomer.mockResolvedValue({ customerId: 'cus_new' });
    mockStripe.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_secret' });
    mockProfiles.save.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: 'u1', email: 'a@b.com' });

    expect(mockStripe.createCustomer).toHaveBeenCalledWith('u1', 'a@b.com');
    expect(mockProfiles.save).toHaveBeenCalledWith({ userId: 'u1', stripeCustomerId: 'cus_new', stripePaymentMethodId: null });
    expect(result).toEqual({ clientSecret: 'seti_secret' });
  });

  it('reuses existing Stripe customer if profile exists', async () => {
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_existing', stripePaymentMethodId: null });
    mockStripe.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_secret2' });

    const result = await useCase.execute({ userId: 'u1', email: 'a@b.com' });

    expect(mockStripe.createCustomer).not.toHaveBeenCalled();
    expect(result).toEqual({ clientSecret: 'seti_secret2' });
  });
});
