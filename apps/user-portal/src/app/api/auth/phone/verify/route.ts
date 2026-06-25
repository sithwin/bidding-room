import { NextRequest, NextResponse } from 'next/server';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/phone/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
