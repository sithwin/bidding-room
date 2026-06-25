import { NextRequest } from 'next/server';

const AUCTION_SERVICE_URL = process.env.AUCTION_SERVICE_URL ?? 'http://localhost:3003';

export async function GET(
  request: NextRequest,
  { params }: { params: { lotId: string } },
) {
  const upstream = await fetch(`${AUCTION_SERVICE_URL}/api/auctions/${params.lotId}/stream`, {
    headers: { Accept: 'text/event-stream' },
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('Stream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}
