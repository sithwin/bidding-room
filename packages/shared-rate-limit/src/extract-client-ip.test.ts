import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { extractClientIp } from './extract-client-ip';

async function probeIp(headers: Record<string, string>): Promise<string> {
  const app = new Hono();
  app.get('/probe', (c) => c.text(extractClientIp(c)));
  const res = await app.request('/probe', { headers });
  return res.text();
}

describe('extractClientIp', () => {
  it('should_returnLeftmostEntry_when_xForwardedForHasMultipleIps', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 172.16.0.2' });

    expect(ip).toBe('203.0.113.7');
  });

  it('should_trimWhitespace_when_headerEntryHasSpaces', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '  203.0.113.7  , 10.0.0.1' });

    expect(ip).toBe('203.0.113.7');
  });

  it('should_acceptIpv6_when_headerHoldsIpv6Address', async () => {
    const ip = await probeIp({ 'x-forwarded-for': '2001:db8::1' });

    expect(ip).toBe('2001:db8::1');
  });

  it('should_fallBackToUnknown_when_headerIsMissingAndNoConnectionInfo', async () => {
    const ip = await probeIp({});

    expect(ip).toBe('unknown');
  });

  it('should_fallBackToUnknown_when_headerIsNotIpShaped', async () => {
    const ip = await probeIp({ 'x-forwarded-for': 'not-an-ip; DROP TABLE users' });

    expect(ip).toBe('unknown');
  });
});
