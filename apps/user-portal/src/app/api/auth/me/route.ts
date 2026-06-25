import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${USER_SERVICE_URL}/api/users/me`, { headers: { Authorization: auth }, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}
