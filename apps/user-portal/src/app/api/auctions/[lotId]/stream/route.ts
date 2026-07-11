import { NextRequest } from 'next/server';
import { AUCTION_ENGINE_URL } from '@/lib/service-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> },
) {
  const { lotId } = await params;
  const upstream = await fetch(`${AUCTION_ENGINE_URL}/api/auctions/${lotId}/stream`, {
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
