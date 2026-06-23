import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { suspendUser, reinstateUser } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('suspendUser', () => {
  it('should_callAdminApiPatch_with_reason', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'user-1' } });

    const result = await suspendUser('user-1', 'Suspicious bidding behaviour detected.');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/users/user-1/suspend', { reason: 'Suspicious bidding behaviour detected.' });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_reasonIsTooShort', async () => {
    const result = await suspendUser('user-1', 'short');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('reinstateUser', () => {
  it('should_callAdminApiPatch', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'user-1' } });

    await reinstateUser('user-1');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/users/user-1/reinstate', {});
  });
});
