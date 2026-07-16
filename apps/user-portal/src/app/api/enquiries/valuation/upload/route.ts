import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader } from '@/lib/service-config';
const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
export async function POST(request: NextRequest) {
  const body = await request.formData();
  const res = await fetch(`${ADMIN_SERVICE_URL}/enquiries/valuation/upload`, {
    method: 'POST',
    headers: forwardedForHeader(request),
    body,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}