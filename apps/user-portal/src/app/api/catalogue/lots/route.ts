import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader } from '@/lib/service-config';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const res = await fetch(`${CATALOGUE_URL}/api/lots${search}`, {
    headers: forwardedForHeader(request),
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
