import { NextRequest, NextResponse } from 'next/server';
import { PAYMENT_SERVICE_URL } from '@/lib/service-config';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
