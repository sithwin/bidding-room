import { NextRequest, NextResponse } from 'next/server';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/setup-intent/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
