import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { createLot, updateLot, deleteLot } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('createLot', () => {
  it('should_callAdminApiPostAndReturn_when_formDataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { id: 'lot-1' } });

    const fd = new FormData();
    fd.append('title', 'Emerald Ring');
    fd.append('description', 'Natural 2ct emerald');
    fd.append('categoryId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    fd.append('condition', 'EXCELLENT');
    fd.append('estimatedValue', '3000');

    const result = await createLot({}, fd);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots', expect.objectContaining({ title: 'Emerald Ring' }));
    expect(result).toEqual({ ok: true, id: 'lot-1' });
  });

  it('should_returnErrors_when_formDataIsInvalid', async () => {
    const fd = new FormData();
    fd.append('title', '');

    const result = await createLot({}, fd);

    expect(result).toMatchObject({ ok: false, errors: expect.any(Object) });
    expect(adminApi.post).not.toHaveBeenCalled();
  });
});

describe('deleteLot', () => {
  it('should_callAdminApiDeleteWithId', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: { id: 'lot-1' } });

    await deleteLot('lot-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/lots/lot-1');
  });
});
