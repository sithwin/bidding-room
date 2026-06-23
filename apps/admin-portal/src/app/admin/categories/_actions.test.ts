import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi, AdminApiError } from '@/lib/admin-api';
import { createCategory, renameCategory, deleteCategory } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('createCategory', () => {
  it('should_callAdminApiPost_when_dataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { id: 'cat-1' } });

    const result = await createCategory({ name: 'Rings', slug: 'rings' });

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/categories', { name: 'Rings', slug: 'rings' });
    expect(result).toEqual({ ok: true });
  });
});

describe('renameCategory', () => {
  it('should_callAdminApiPatch_with_id', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'cat-1' } });

    await renameCategory('cat-1', 'Updated Name');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/categories/cat-1', { name: 'Updated Name' });
  });
});

describe('deleteCategory', () => {
  it('should_returnError_when_lotsAreAssigned', async () => {
    vi.mocked(adminApi.delete).mockRejectedValue(new AdminApiError(409, { error: { code: 'LOTS_ASSIGNED' } }));

    const result = await deleteCategory('cat-1');

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'LOTS_ASSIGNED' }) });
  });
});
