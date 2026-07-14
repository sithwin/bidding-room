import type { Redis } from 'ioredis';
import { createRateLimiter } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;
const BID_MAX_REQUESTS = 30;
const DEFAULT_MAX_REQUESTS = 100;

export function buildAuctionEngineRateLimits(redis: Redis) {
  return {
    bid: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: BID_MAX_REQUESTS,
      keyPrefix: 'auction-engine:bid',
    }),
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'auction-engine:default',
    }),
  };
}
