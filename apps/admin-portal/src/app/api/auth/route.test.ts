import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockCookiesSet = vi.fn();
const mockCookiesDelete = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ set: mockCookiesSet, delete: mockCookiesDelete })),
}));

import { POST, DELETE } from './route';

const TOKEN_TTL_SECONDS = 900;

function buildToken(role: string, exp?: number): string {
  const encode = (v: Record<string, unknown>) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const payload = { userId: 'u1', role, exp: exp ?? Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.fake-signature`;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/auth', () => {
  it('should_setCookieAndReturn200_when_adminCredentialsAreValid', async () => {
    const adminToken = buildToken('ADMIN');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: adminToken } }),
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
      adminToken,
      expect.objectContaining({ httpOnly: true }),
    );
    // Cookie lifetime must be derived from the token's exp claim
    const { maxAge } = mockCookiesSet.mock.calls[0][2] as { maxAge: number };
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(TOKEN_TTL_SECONDS);
  });

  it('should_return401_when_roleIsNotAdmin', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: buildToken('BUYER') } }),
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

  it('should_return401_when_tokenIsAlreadyExpired', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { accessToken: buildToken('ADMIN', Math.floor(Date.now() / 1000) - 60) } }),
    });

    const req = new Request('http://localhost/api/auth', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@test.com', password: 'pass123' }),
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
