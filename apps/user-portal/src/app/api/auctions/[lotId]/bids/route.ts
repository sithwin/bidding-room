import { NextResponse } from 'next/server';
import { AUCTION_ENGINE_URL, forwardedForHeader } from '@/lib/service-config';

// Proxies bid placement to the auction-engine. Fixes gap D2 — the lot detail
// page previously posted to a route that did not exist anywhere in the app.
export async function POST(request: Request, { params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const res = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}/bids`, {
    method: 'POST',
    headers: {
      authorization: request.headers.get('authorization') ?? '',
      'content-type': 'application/json',
      ...forwardedForHeader(request),
    },
    body: JSON.stringify(await request.json()),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
