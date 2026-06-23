import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(() => ({ value: 'test-admin-jwt' })) })),
}));

import { adminApi, AdminApiError } from './admin-api';

beforeEach(() => vi.clearAllMocks());

describe('adminApi', () => {
  it('should_returnJson_when_responseIsOk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'lot-1' }] }),
    });

    const result = await adminApi.get<{ data: { id: string }[] }>('/admin/api/lots');

    expect(result).toEqual({ data: [{ id: 'lot-1' }] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/admin/api/lots'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-admin-jwt' }),
      }),
    );
  });

  it('should_throwAdminApiError_when_responseIsNot2xx', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }),
    });

    await expect(adminApi.get('/admin/api/lots/missing')).rejects.toBeInstanceOf(AdminApiError);
  });

  it('should_preserveStatus_on_AdminApiError', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: { code: 'CONFLICT' } }),
    });

    const err = await adminApi.post('/admin/api/lots', {}).catch(e => e);
    expect(err).toBeInstanceOf(AdminApiError);
    expect(err.status).toBe(409);
  });

  it('should_sendBodyAsJson_when_posting', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 'lot-2' } }) });

    await adminApi.post('/admin/api/lots', { title: 'Pearl Bracelet' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Pearl Bracelet' }) }),
    );
  });
});
