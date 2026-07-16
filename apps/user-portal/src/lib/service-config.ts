// Single home for the portal's server-side service endpoints and shared display
// constants. Fallback hostnames match docker-compose service names where the
// portal runs in-network (auction-engine), localhost elsewhere.
export const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export const CATALOGUE_SERVICE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';
// http fallback is intentional: private Docker-network traffic; TLS terminates at the Nginx edge
export const AUCTION_ENGINE_URL = process.env.AUCTION_ENGINE_URL ?? 'http://auction-engine:3003'; // NOSONAR
export const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004';
export const SHIPPING_SERVICE_URL = process.env.SHIPPING_SERVICE_URL ?? 'http://localhost:3006';
export const ADMIN_SERVICE_URL = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';

/** Name of the refresh-token cookie — owned by user-auth (set on login/refresh). */
export const REFRESH_COOKIE = 'carat_refresh';

/**
 * Display-only currency label. No service owns a lot's currency today (flagged
 * as gap G5 in the Phase 2 plan) — this constant is portal copy, not data.
 */
export const DISPLAY_CURRENCY = 'AUD';

/**
 * Every downstream service rate-limits per client IP (extractClientIp reads
 * `x-forwarded-for`). This portal is itself a server-side proxy in front of
 * those services, so without forwarding the header on, every real visitor's
 * request collapses into a single IP bucket — the portal's own. Nginx sets
 * this header for us; pass it straight through unmodified.
 *
 * Accepts either a Route Handler's `Request` or a Server Component's
 * `headers()` (from `next/headers`) directly.
 */
export function forwardedForHeader(source: Request | Headers): Record<string, string> {
  const requestHeaders = 'headers' in source ? source.headers : source;
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  return forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {};
}
