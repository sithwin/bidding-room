import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockCookiesSet = vi.fn();
const mockCookiesDelete = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ set: mockCookiesSet, delete: mockCookiesDelete })),
}));

import { POST, DELETE } from './route';

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/auth', () => {
  it('should_setCookieAndReturn200_when_adminCredentialsAreValid', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: 'jwt-abc', role: 'ADMIN' } }),
    });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@test.com', password: 'pass123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockCookiesSet).toHaveBeenCalledWith(
      'admin_token',
      'jwt-abc',
      expect.objectContaining({ httpOnly: true, maxAge: 28800 }),
    );
  });

  it('should_return401_when_roleIsNotAdmin', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: 'jwt-xyz', role: 'USER' } }),
    });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@test.com', password: 'pass123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it('should_return401_when_userServiceReturnsError', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: { code: 'INVALID_CREDENTIALS' } }) });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'bad@test.com', password: 'wrong' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/auth', () => {
  it('should_clearCookieAndReturn200', async () => {
    const res = await DELETE();

    expect(mockCookiesDelete).toHaveBeenCalledWith('admin_token');
    expect(res.status).toBe(200);
  });
});
