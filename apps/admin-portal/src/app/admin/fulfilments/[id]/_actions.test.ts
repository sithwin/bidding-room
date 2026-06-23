import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { markDispatched, markCollected } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('markDispatched', () => {
  it('should_callAdminApiPatch_with_trackingAndCarrier', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'ful-1' } });

    const result = await markDispatched('ful-1', 'TRK123456', 'DHL');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/fulfilments/ful-1/dispatch', { trackingNumber: 'TRK123456', carrier: 'DHL' });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_trackingNumberIsEmpty', async () => {
    const result = await markDispatched('ful-1', '', 'DHL');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('markCollected', () => {
  it('should_callAdminApiPatch_dispatch', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'ful-1' } });

    await markCollected('ful-1');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/fulfilments/ful-1/collect', {});
  });
});
