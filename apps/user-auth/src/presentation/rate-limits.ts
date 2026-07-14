import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const STRICT_MAX_REQUESTS = 10;
const REFRESH_MAX_REQUESTS = 30;
const DEFAULT_MAX_REQUESTS = 100;

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
