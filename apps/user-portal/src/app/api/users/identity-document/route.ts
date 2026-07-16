import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader } from '@/lib/service-config';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.formData();
  const res = await fetch(`${USER_SERVICE_URL}/api/users/identity-document`, {
    method: 'POST',
    headers: { Authorization: auth, ...forwardedForHeader(request) },
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
