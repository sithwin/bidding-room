import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function GET() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

  const res = await fetch(`${USER_SERVICE_URL}/api/users/refresh`, {
    method: 'POST',
    headers: { 'Cookie': `refresh_token=${refreshToken}` },
    cache: 'no-store',
  });

  if (!res.ok) return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });

  const data = await res.json() as { accessToken: string; user: unknown };
  return NextResponse.json(data);
}

export async function DELETE() {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get('refresh_token')?.value;
  if (refreshToken) {
    await fetch(`${USER_SERVICE_URL}/api/users/logout`, {
      method: 'POST',
      headers: { 'Cookie': `refresh_token=${refreshToken}` },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('refresh_token');
  return res;
}
