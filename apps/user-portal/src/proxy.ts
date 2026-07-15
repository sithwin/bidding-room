import { NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/service-config';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    const loginUrl = new URL('/account/login', request.url);
    loginUrl.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/dashboard', '/account/bids', '/account/watchlist', '/account/won', '/account/invoices/:path*', '/account/fulfilments/:path*', '/account/register-to-bid'],
};
