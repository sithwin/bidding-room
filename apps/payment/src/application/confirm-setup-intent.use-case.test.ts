import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmSetupIntentUseCase } from './confirm-setup-intent.use-case';

const mockProfiles = { findByUserId: vi.fn(), save: vi.fn() };
const mockStripe = { retrieveSetupIntent: vi.fn() };

describe('ConfirmSetupIntentUseCase', () => {
  let useCase: ConfirmSetupIntentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new ConfirmSetupIntentUseCase(mockProfiles as any, mockStripe as any);
  });

  it('saves paymentMethodId when SetupIntent succeeded', async () => {
    mockStripe.retrieveSetupIntent.mockResolvedValue({
      status: 'succeeded',
      customerId: 'cus_abc',
      paymentMethodId: 'pm_xyz',
    });
    mockProfiles.findByUserId.mockResolvedValue({ userId: 'u1', stripeCustomerId: 'cus_abc', stripePaymentMethodId: null });
    mockProfiles.save.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: 'u1', setupIntentId: 'seti_1' });

    expect(mockProfiles.save).toHaveBeenCalledWith({
      userId: 'u1',
      stripeCustomerId: 'cus_abc',
      stripePaymentMethodId: 'pm_xyz',
    });
    expect(result).toEqual({ ok: true });
  });

  it('throws when SetupIntent has not succeeded', async () => {
    mockStripe.retrieveSetupIntent.mockResolvedValue({ status: 'requires_action', customerId: 'cus_abc', paymentMethodId: null });
    await expect(
      useCase.execute({ userId: 'u1', setupIntentId: 'seti_1' }),
    ).rejects.toThrow('SetupIntent has not succeeded');
  });
});
