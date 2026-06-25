import { NextRequest, NextResponse } from 'next/server';

const SHIPPING_SERVICE_URL = process.env.SHIPPING_SERVICE_URL ?? 'http://localhost:3006';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = request.headers.get('authorization') ?? '';
  const body = await request.json();
  const res = await fetch(`${SHIPPING_SERVICE_URL}/api/shipping/fulfilments/${params.id}/collection-slot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
