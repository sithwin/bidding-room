import { NextRequest, NextResponse } from 'next/server';
import { forwardedForHeader, GOOGLE_OAUTH_STATE_COOKIE, USER_SERVICE_URL } from '@/lib/service-config';

interface StateCookiePayload {
  state: string;
  codeVerifier: string;
  returnUrl: string;
}

function redirectToLoginWithError(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/account/login', request.url);
  url.searchParams.set('googleError', reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const stateCookieValue = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !stateCookieValue) {
    return redirectToLoginWithError(request, 'cancelled');
  }

  let stateCookie: StateCookiePayload;
  try {
    stateCookie = JSON.parse(stateCookieValue) as StateCookiePayload;
  } catch {
    return redirectToLoginWithError(request, 'cancelled');
  }

  if (stateCookie.state !== state) {
    return redirectToLoginWithError(request, 'cancelled');
  }

  let res: Response;
  try {
    res = await fetch(`${USER_SERVICE_URL}/api/users/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedForHeader(request) },
      body: JSON.stringify({ code, codeVerifier: stateCookie.codeVerifier }),
    });
  } catch {
    return redirectToLoginWithError(request, 'failed');
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const reason = errorBody?.error?.code === 'EMAIL_NOT_VERIFIED' ? 'email_not_verified' : 'failed';
    return redirectToLoginWithError(request, reason);
  }

  const completeUrl = new URL('/account/oauth-complete', request.url);
  completeUrl.searchParams.set('returnUrl', stateCookie.returnUrl);
  const response = NextResponse.redirect(completeUrl);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  const setCookie = res.headers.get('set-cookie');
  // append, not set: cookies.delete() above already queued a Set-Cookie header
  // for the state cookie's removal — .set() would overwrite it instead of adding to it.
  if (setCookie) response.headers.append('set-cookie', setCookie);
  return response;
}
