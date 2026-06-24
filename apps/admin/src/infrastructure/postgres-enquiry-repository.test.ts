import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresEnquiryRepository } from './postgres-enquiry-repository';

const mockDb = vi.fn().mockReturnValue([]);

describe('PostgresEnquiryRepository', () => {
  let repo: PostgresEnquiryRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.mockReturnValue([]);
    repo = new PostgresEnquiryRepository(mockDb as any);
  });

  it('inserts a valuation enquiry', async () => {
    await repo.save({
      category: 'Jewellery',
      artistMaker: null,
      description: 'Gold ring',
      photoKeys: ['valuation-enquiries/uploads/abc.jpg'],
      name: 'Jane Smith',
      email: 'jane@example.com',
    });
    expect(mockDb).toHaveBeenCalledOnce();
  });
});
