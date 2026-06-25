import { NextRequest, NextResponse } from 'next/server';

const CATALOGUE_SERVICE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const res = await fetch(`${CATALOGUE_SERVICE_URL}/api/account/watchlist${request.nextUrl.search}`, { headers: { Authorization: auth }, cache: 'no-store' });
  return NextResponse.json(await res.json(), { status: res.status });
}
