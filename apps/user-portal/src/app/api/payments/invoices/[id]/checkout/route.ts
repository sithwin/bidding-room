import { NextRequest, NextResponse } from 'next/server';
import { PAYMENT_SERVICE_URL, forwardedForHeader } from '@/lib/service-config';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}/checkout`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'content-type': 'application/json',
      ...forwardedForHeader(request),
    },
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
