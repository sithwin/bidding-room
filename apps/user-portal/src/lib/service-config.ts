// Single home for the portal's server-side service endpoints and shared display
// constants. Fallback hostnames match docker-compose service names where the
// portal runs in-network (auction-engine), localhost elsewhere.
export const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001';
export const CATALOGUE_SERVICE_URL = process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002';
export const AUCTION_ENGINE_URL = process.env.AUCTION_ENGINE_URL ?? 'http://auction-engine:3003';
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
