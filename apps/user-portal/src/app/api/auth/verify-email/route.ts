import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('token');
    const userId = request.nextUrl.searchParams.get('userId');
    const res = await fetch(`${USER_SERVICE_URL}/api/users/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, code }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Verification service unavailable.' } },
      { status: 503 },
    );
  }
}
