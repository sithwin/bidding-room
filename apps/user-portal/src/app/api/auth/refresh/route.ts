import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseAccessToken } from '@/lib/user-auth';
import { REFRESH_COOKIE, USER_SERVICE_URL } from '@/lib/service-config';

export async function GET() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

  const res = await fetch(`${USER_SERVICE_URL}/api/users/refresh`, {
    method: 'POST',
    headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const accessToken = parseAccessToken(await res.json());
  if (!accessToken) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const response = NextResponse.json({ data: { accessToken } });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) response.headers.set('set-cookie', setCookie); // forward the rotated carat_refresh
  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${USER_SERVICE_URL}/api/users/logout`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
