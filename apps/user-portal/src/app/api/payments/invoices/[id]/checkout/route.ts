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
  try {
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    // payment-service returned a non-JSON body (e.g. a framework-level error page) - surface a
    // structured error instead of letting the SyntaxError propagate into Next's own default
    // (plain-text) 500 handler.
    return NextResponse.json({ error: { code: 'CHECKOUT_FAILED', message: 'Unable to start checkout' } }, { status: 502 });
  }
}
