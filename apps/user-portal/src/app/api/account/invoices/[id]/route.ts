import { NextRequest, NextResponse } from 'next/server';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/invoices/${params.id}`, {
    headers: { Authorization: auth },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}