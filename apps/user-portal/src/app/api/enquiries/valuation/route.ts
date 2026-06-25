import { NextRequest, NextResponse } from 'next/server';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${ADMIN_SERVICE_URL}/enquiries/valuation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return NextResponse.json(await res.json(), { status: res.status });
}