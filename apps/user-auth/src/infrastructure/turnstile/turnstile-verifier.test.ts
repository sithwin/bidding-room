import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnstileVerifier } from './turnstile-verifier';

const SECRET = 'test-secret';

describe('TurnstileVerifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should_returnTrue_when_cloudflareReportsSuccess', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token', '203.0.113.7');

    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = (init.body as URLSearchParams).toString();
    expect(sent).toContain('secret=test-secret');
    expect(sent).toContain('response=a-token');
    expect(sent).toContain('remoteip=203.0.113.7');
  });

  it('should_returnFalse_when_cloudflareReportsFailure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 }),
    ));
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-bad-token');

    expect(result).toBe(false);
  });

  it('should_failOpenReturningTrue_when_networkErrorOccurs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('a-token');
  });

  it('should_failOpenReturningTrue_when_requestTimesOut', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
  });

  it('should_failOpenReturningTrue_when_responseIsNotJson', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sut = new TurnstileVerifier(SECRET);

    const result = await sut.verify('a-token');

    expect(result).toBe(true);
  });
});
