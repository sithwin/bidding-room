import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildToken(exp: number): string {
  const header = encodeSegment({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeSegment({ userId: 'u1', role: 'ADMIN', exp });
  return `${header}.${payload}.fake-signature`;
}

function buildRequest(path: string, token?: string): NextRequest {
  const request = new NextRequest(new URL(`http://localhost:3006${path}`));
  if (token) {
    request.cookies.set('admin_token', token);
  }
  return request;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 900;
const PAST_EXP = Math.floor(Date.now() / 1000) - 60;

describe('proxy', () => {
  it('should_redirectToLogin_when_noTokenOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard'));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
  });

  it('should_allowRequest_when_tokenIsValidOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard', buildToken(FUTURE_EXP)));

    expect(res.headers.get('location')).toBeNull();
  });

  it('should_redirectToDashboard_when_tokenIsValidOnLoginPage', () => {
    const res = proxy(buildRequest('/admin/login', buildToken(FUTURE_EXP)));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/dashboard');
  });

  it('should_redirectToLoginAndClearCookie_when_tokenIsExpiredOnProtectedPath', () => {
    const res = proxy(buildRequest('/admin/dashboard', buildToken(PAST_EXP)));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
    expect(res.headers.get('set-cookie')).toContain('admin_token=;');
  });

  it('should_allowLoginPage_when_tokenIsExpired', () => {
    const res = proxy(buildRequest('/admin/login', buildToken(PAST_EXP)));

    expect(res.headers.get('location')).toBeNull();
  });

  it('should_redirectToLoginAndClearCookie_when_tokenIsMalformed', () => {
    const res = proxy(buildRequest('/admin/dashboard', 'not-a-jwt'));

    expect(res.headers.get('location')).toBe('http://localhost:3006/admin/login');
    expect(res.headers.get('set-cookie')).toContain('admin_token=;');
  });
});
