import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';

export async function POST(req: Request): Promise<NextResponse> {
  const { email, password } = await req.json() as { email: string; password: string };

  const userServiceUrl = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
  const res = await fetch(`${userServiceUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json() as { data?: { accessToken: string }; error?: unknown };

  if (!res.ok || !body.data) {
    return NextResponse.json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }, { status: 401 });
  }

  const payload = decodeJwt(body.data.accessToken);
  if (payload['role'] !== 'ADMIN') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 401 });
  }

  cookies().set('admin_token', body.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 28800,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  cookies().delete('admin_token');
  return NextResponse.json({ ok: true });
}
