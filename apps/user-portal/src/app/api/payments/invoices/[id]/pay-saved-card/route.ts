import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader } from '@/lib/service-config';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/invoices/${id}/pay-saved-card`, {
    method: 'POST',
    headers: { Authorization: auth, ...forwardedForHeader(request) },
  });
  return NextResponse.json(await res.json(), { status: res.status });
}