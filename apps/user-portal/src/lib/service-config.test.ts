import { describe, it, expect } from 'vitest';
import { forwardedForHeader } from './service-config';

describe('forwardedForHeader', () => {
  it('should_returnForwardedForHeader_when_givenARequest', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });

    expect(forwardedForHeader(request)).toEqual({ 'X-Forwarded-For': '203.0.113.5' });
  });

  it('should_returnForwardedForHeader_when_givenAHeadersInstance', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.6' });

    expect(forwardedForHeader(headers)).toEqual({ 'X-Forwarded-For': '203.0.113.6' });
  });

  // next/headers' headers() returns a Headers subclass that also carries its
  // own internal `.headers` property (Next's HeadersAdapter proxies the raw
  // header object under `this.headers`) — this reproduces that shape so a
  // naive `'headers' in source` check can't silently regress again.
  it('should_returnForwardedForHeader_when_givenAHeadersSubclassWithItsOwnHeadersProperty', () => {
    class HeadersAdapterLike extends Headers {
      headers: unknown = { 'x-forwarded-for': 'not-a-real-headers-object' };
    }
    const adapter = new HeadersAdapterLike({ 'x-forwarded-for': '203.0.113.7' });

    expect(forwardedForHeader(adapter)).toEqual({ 'X-Forwarded-For': '203.0.113.7' });
  });

  it('should_returnEmptyObject_when_headerIsAbsent', () => {
    const request = new Request('http://localhost/');

    expect(forwardedForHeader(request)).toEqual({});
  });
});
