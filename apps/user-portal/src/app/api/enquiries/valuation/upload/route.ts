import { NextRequest, NextResponse } from 'next/server';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
export async function POST(request: NextRequest) {
  const body = await request.formData();
  const res = await fetch(`${ADMIN_SERVICE_URL}/enquiries/valuation/upload`, { method: 'POST', body });
  return NextResponse.json(await res.json(), { status: res.status });
}