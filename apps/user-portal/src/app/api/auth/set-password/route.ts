import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader, USER_SERVICE_URL } from '@/lib/service-config';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  try {
    const body = await request.json();
    const res = await fetch(`${USER_SERVICE_URL}/api/users/me/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth, ...forwardedForHeader(request) },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Unable to set password. Please try again.' } },
      { status: 503 },
    );
  }
}
