import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmitValuationEnquiryUseCase } from './submit-valuation-enquiry.use-case';

const mockRepo = { save: vi.fn() };
const mockPublish = vi.fn();

describe('SubmitValuationEnquiryUseCase', () => {
  let useCase: SubmitValuationEnquiryUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new SubmitValuationEnquiryUseCase(mockRepo as any, mockPublish);
  });

  it('saves enquiry and publishes event', async () => {
    mockRepo.save.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);

    const result = await useCase.execute({
      category: 'Jewellery',
      artistMaker: null,
      description: 'Diamond ring',
      photoKeys: [],
      name: 'Jane',
      email: 'jane@example.com',
    });

    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(mockPublish).toHaveBeenCalledWith('enquiry.valuation.received', expect.any(Object));
    expect(result).toEqual({ ok: true });
  });
});
