import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { REFRESH_COOKIE } from '@/lib/service-config';

describe('proxy', () => {
  it('redirects to login when the refresh-token cookie is absent', async () => {
    const request = new NextRequest(new URL('http://localhost/account/dashboard'));

    const response = await proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/account/login');
    expect(location.searchParams.get('returnUrl')).toBe('/account/dashboard');
  });

  it('does not redirect when the real refresh cookie ("carat_refresh") is present', async () => {
    // Regression test: proxy.ts previously read the literal 'refresh_token',
    // which never matches the real cookie name and locked every logged-in
    // user out of the whole authenticated account area.
    const request = new NextRequest(new URL('http://localhost/account/dashboard'), {
      headers: { cookie: `${REFRESH_COOKIE}=some-refresh-token-value` },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('still redirects when a cookie named refresh_token (the old wrong literal) is present but carat_refresh is not', async () => {
    const request = new NextRequest(new URL('http://localhost/account/dashboard'), {
      headers: { cookie: 'refresh_token=some-refresh-token-value' },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
  });
});
