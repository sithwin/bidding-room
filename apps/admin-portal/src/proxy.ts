import { NextRequest, NextResponse } from 'next/server';
import { decodeJwt } from 'jose';
import { ADMIN_TOKEN_COOKIE } from '@/lib/auth-cookie';

function hasValidToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === 'number' && exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value;
  const isTokenValid = hasValidToken(token);
  const isLoginPage = pathname === '/admin/login';

  if (!isTokenValid && !isLoginPage) {
    const response = NextResponse.redirect(new URL('/admin/login', request.url));
    if (token) response.cookies.delete(ADMIN_TOKEN_COOKIE);
    return response;
  }

  if (isTokenValid && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
