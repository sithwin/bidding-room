import { NextRequest, NextResponse } from 'next/server';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/profile`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
