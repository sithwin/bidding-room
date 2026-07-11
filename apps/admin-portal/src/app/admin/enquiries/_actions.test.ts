import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi, AdminApiError } from '@/lib/admin-api';
import { updateEnquiryStatus } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('updateEnquiryStatus', () => {
  it('should_callAdminApiPatch_with_status', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'enq-1' } });

    const result = await updateEnquiryStatus('enq-1', 'RESPONDED');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/enquiries/enq-1/status', { status: 'RESPONDED' });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_adminApiThrows', async () => {
    vi.mocked(adminApi.patch).mockRejectedValue(new AdminApiError(404, { error: { code: 'NOT_FOUND' } }));

    const result = await updateEnquiryStatus('missing', 'CLOSED');

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ error: { code: 'NOT_FOUND' } });
  });
});
