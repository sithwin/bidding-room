import { NextRequest, NextResponse } from 'next/server';
import { AUCTION_ENGINE_URL, forwardedForHeader } from '@/lib/service-config';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${AUCTION_ENGINE_URL}/api/account/stats${request.nextUrl.search}`, {
    headers: { Authorization: auth, ...forwardedForHeader(request) },
    cache: 'no-store',
  });

  // The downstream service may fail with a non-JSON body (e.g. a plain-text 404/502
  // from a proxy or load balancer) — guard against that before parsing, so a real
  // downstream failure surfaces as a clean error instead of a JSON-parse crash.
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('application/json')) {
    return NextResponse.json(
      { error: { code: 'UPSTREAM_ERROR', message: 'Failed to load account stats' } },
      { status: res.ok ? 502 : res.status },
    );
  }

  return NextResponse.json(await res.json(), { status: res.status });
}
