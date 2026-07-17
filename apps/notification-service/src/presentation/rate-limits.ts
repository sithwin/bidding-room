import type { Redis } from 'ioredis';
import { createRateLimiter, maxRequestsFromEnv } from '@carat-room/shared-rate-limit';

const ONE_MINUTE_MS = 60_000;

// Overridable per environment - see apps/user-auth/src/presentation/rate-limits.ts
// for why: the E2E suite's shared container IP legitimately exceeds a
// single real user's production ceiling. docker-compose.test.yml raises
// NOTIFICATION_DEFAULT_RATE_LIMIT_MAX for exactly this reason.
const DEFAULT_MAX_REQUESTS = maxRequestsFromEnv('NOTIFICATION_DEFAULT_RATE_LIMIT_MAX', 100);

export function buildNotificationRateLimits(redis: Redis) {
  return {
    default: createRateLimiter({
      redis,
      windowMs: ONE_MINUTE_MS,
      max: DEFAULT_MAX_REQUESTS,
      keyPrefix: 'notification:default',
    }),
  };
}
