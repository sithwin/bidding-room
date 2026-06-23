import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { patch: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { extendDueDate, cancelInvoice } from './_actions';

beforeEach(() => vi.clearAllMocks());

describe('extendDueDate', () => {
  it('should_callAdminApiPatch_with_futureDate', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'inv-1' } });

    const future = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
    const result = await extendDueDate('inv-1', future);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/invoices/inv-1/extend', { dueAt: future });
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_dateIsInPast', async () => {
    const result = await extendDueDate('inv-1', '2020-01-01');

    expect(result).toMatchObject({ ok: false });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });
});

describe('cancelInvoice', () => {
  it('should_callAdminApiPatch_with_reason', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'inv-1' } });

    const result = await cancelInvoice('inv-1', 'Customer requested cancellation of this invoice.');

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/invoices/inv-1/cancel', { reason: 'Customer requested cancellation of this invoice.' });
    expect(result).toEqual({ ok: true });
  });
});
