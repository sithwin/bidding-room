import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  AdminApiError: class AdminApiError extends Error {
    constructor(public status: number, public body: unknown) { super(); }
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi, AdminApiError } from '@/lib/admin-api';
import { createUser, updateUser } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('createUser', () => {
  it('should_returnErrors_when_formDataIsInvalid', async () => {
    const fd = new FormData();
    fd.append('email', 'not-an-email');
    fd.append('password', 'short');
    fd.append('role', 'BUYER');

    const result = await createUser({}, fd);

    expect(result).toMatchObject({ ok: false, errors: expect.any(Object) });
    expect(adminApi.post).not.toHaveBeenCalled();
  });

  it('should_callAdminApiPostAndReturn_when_formDataIsValid', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { id: 'user-1' } });

    const fd = new FormData();
    fd.append('email', 'buyer@example.com');
    fd.append('password', 'CorrectHorse9!Battery');
    fd.append('role', 'BUYER');
    fd.append('country', 'GB');

    const result = await createUser({}, fd);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/users', expect.objectContaining({ email: 'buyer@example.com' }));
    expect(result).toEqual({ ok: true, id: 'user-1' });
  });

  it('should_returnError_when_adminApiThrowsAdminApiError', async () => {
    vi.mocked(adminApi.post).mockRejectedValue(new AdminApiError(409, { error: { code: 'CONFLICT', message: 'Email already registered' } }));

    const fd = new FormData();
    fd.append('email', 'buyer@example.com');
    fd.append('password', 'CorrectHorse9!Battery');
    fd.append('role', 'BUYER');

    const result = await createUser({}, fd);

    expect(result).toEqual({ ok: false, error: { error: { code: 'CONFLICT', message: 'Email already registered' } } });
  });
});

describe('updateUser', () => {
  it('should_returnErrors_when_formDataIsInvalid', async () => {
    const fd = new FormData();
    fd.append('email', 'not-an-email');

    const result = await updateUser('user-1', {}, fd);

    expect(result).toMatchObject({ ok: false, errors: expect.any(Object) });
    expect(adminApi.patch).not.toHaveBeenCalled();
  });

  it('should_callAdminApiPatchAndReturn_when_formDataIsValid', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: { id: 'user-1' } });

    const fd = new FormData();
    fd.append('email', 'buyer@example.com');
    fd.append('country', 'GB');

    const result = await updateUser('user-1', {}, fd);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/users/user-1', expect.objectContaining({ email: 'buyer@example.com' }));
    expect(result).toEqual({ ok: true });
  });

  it('should_returnError_when_adminApiThrowsAdminApiError', async () => {
    vi.mocked(adminApi.patch).mockRejectedValue(new AdminApiError(400, { error: { code: 'VALIDATION', message: 'Invalid' } }));

    const fd = new FormData();
    fd.append('email', 'buyer@example.com');

    const result = await updateUser('user-1', {}, fd);

    expect(result).toEqual({ ok: false, error: { error: { code: 'VALIDATION', message: 'Invalid' } } });
  });
});
