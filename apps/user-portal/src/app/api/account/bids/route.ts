import { NextRequest, NextResponse } from 'next/server';

const AUCTION_SERVICE_URL = process.env.AUCTION_SERVICE_URL ?? 'http://localhost:3003';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${AUCTION_SERVICE_URL}/api/account/bids${request.nextUrl.search}`, { headers: { Authorization: auth }, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}
