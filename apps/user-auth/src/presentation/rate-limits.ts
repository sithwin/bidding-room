import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;

// Overridable per environment: the 'strict' tier keys login, register,
// verify-email, and both phone-OTP endpoints off the SAME per-IP counter
// (see main.ts's mounts below), so a legitimate end user rarely comes close
// to it. An E2E/Playwright suite does not look like one end user to this
// limiter, though — every spec's setup creates its own throwaway account
// from the single container IP the whole suite runs behind, so the strict
// tier's production-appropriate ceiling starts rejecting real (non-abusive)
// test traffic partway through a run. docker-compose.test.yml raises
// USER_AUTH_STRICT_RATE_LIMIT_MAX for exactly this reason; production is
// untouched by leaving the env var unset there.
export function maxRequestsFromEnv(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

const STRICT_MAX_REQUESTS = maxRequestsFromEnv('USER_AUTH_STRICT_RATE_LIMIT_MAX', 10);
const REFRESH_MAX_REQUESTS = maxRequestsFromEnv('USER_AUTH_REFRESH_RATE_LIMIT_MAX', 30);
const DEFAULT_MAX_REQUESTS = maxRequestsFromEnv('USER_AUTH_DEFAULT_RATE_LIMIT_MAX', 100);

export function buildUserAuthRateLimits(redis: Redis) {
  return {
    // Login, register, verify-email, phone OTP request/verify — brute-force
    // and credential-stuffing targets.
    strict: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: STRICT_MAX_REQUESTS,
      keyPrefix: 'user-auth:strict',
    }),
    refresh: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: REFRESH_MAX_REQUESTS,
      keyPrefix: 'user-auth:refresh',
    }),
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'user-auth:default',
    }),
  };
}
