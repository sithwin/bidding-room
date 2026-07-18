import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { ADMIN_TOKEN_COOKIE, cookieMaxAgeFrom } from '@/lib/auth-cookie';
import { forwardedForHeader } from '@/lib/forwarded-ip';

export async function POST(req: Request): Promise<NextResponse> {
  const { email, password } = await req.json() as { email: string; password: string };

  const userServiceUrl = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
  const res = await fetch(`${userServiceUrl}/api/users/admin-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-service-secret': process.env.ADMIN_LOGIN_INTERNAL_SECRET ?? '',
      ...forwardedForHeader(req.headers),
    },
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

  const maxAge = cookieMaxAgeFrom(payload.exp);
  if (maxAge === 0) {
    return NextResponse.json({ error: { code: 'INVALID_TOKEN', message: 'Received an expired or non-expiring token' } }, { status: 401 });
  }

  (await cookies()).set(ADMIN_TOKEN_COOKIE, body.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<NextResponse> {
  (await cookies()).delete(ADMIN_TOKEN_COOKIE);
  return NextResponse.json({ ok: true });
}
