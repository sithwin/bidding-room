import { NextRequest, NextResponse } from 'next/server';
import { AUCTION_ENGINE_URL, forwardedForHeader } from '@/lib/service-config';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${AUCTION_ENGINE_URL}/api/account/stats${request.nextUrl.search}`, {
    headers: { Authorization: auth, ...forwardedForHeader(request) },
    cache: 'no-store',
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
