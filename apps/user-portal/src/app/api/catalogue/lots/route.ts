import { NextRequest, NextResponse } from 'next/server';

const CATALOGUE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search;
  const res = await fetch(`${CATALOGUE_URL}/api/lots${search}`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
