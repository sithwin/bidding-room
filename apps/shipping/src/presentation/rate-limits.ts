import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

export function buildShippingRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'shipping:default',
    }),
  };
}
