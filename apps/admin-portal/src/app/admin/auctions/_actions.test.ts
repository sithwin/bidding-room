import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { scheduleAuction, cancelAuction } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

const futureDate = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('scheduleAuction', () => {
  it('should_callAdminApiPost_when_formDataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { lotId: 'lot-1' } });

    const fd = new FormData();
    fd.append('lotId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('startAt', futureDate(1));
    fd.append('endAt', futureDate(25));
    fd.append('reservePrice', '500');
    fd.append('minBidIncrement', '10');
    fd.append('autoExtendWindowMinutes', '3');
    fd.append('autoExtendDurationMinutes', '3');

    const result = await scheduleAuction({}, fd);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/auctions', expect.objectContaining({ reservePrice: 500 }));
    expect(result).toMatchObject({ ok: true });
  });

  it('should_returnErrors_when_endIsBeforeStart', async () => {
    const fd = new FormData();
    fd.append('lotId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('startAt', futureDate(2));
    fd.append('endAt', futureDate(1));
    fd.append('reservePrice', '500');
    fd.append('minBidIncrement', '10');
    fd.append('autoExtendWindowMinutes', '3');
    fd.append('autoExtendDurationMinutes', '3');

    const result = await scheduleAuction({}, fd);

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.post).not.toHaveBeenCalled();
  });
});

describe('cancelAuction', () => {
  it('should_callAdminApiDelete_with_lotId', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: { lotId: 'lot-1' } });

    await cancelAuction('lot-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/auctions/lot-1');
  });
});
