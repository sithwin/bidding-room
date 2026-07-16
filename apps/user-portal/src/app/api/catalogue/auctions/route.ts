import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader } from '@/lib/service-config';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const res = await fetch(`${CATALOGUE_URL}/api/auctions${request.nextUrl.search}`, {
    headers: forwardedForHeader(request),
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
