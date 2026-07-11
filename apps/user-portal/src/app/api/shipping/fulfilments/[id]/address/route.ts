import { NextRequest, NextResponse } from 'next/server';
import { SHIPPING_SERVICE_URL } from '@/lib/service-config';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${id}/choose-ship`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}