import { Context, Next } from 'hono';
import { timingSafeEqual } from 'node:crypto';

/**
 * Gates a route on a pre-shared secret known only to a specific internal
 * caller (here: admin-portal), instead of Turnstile. Fails closed: an empty
 * `expectedSecret` (unconfigured deployment) always rejects, rather than
 * accepting requests with no header — see /api/users/admin-login's callers.
 */
export const requireInternalServiceSecret = (expectedSecret: string) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const provided = c.req.header('x-internal-service-secret') ?? '';
    const isAuthorised =
      expectedSecret.length > 0 &&
      provided.length === expectedSecret.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSecret));
    if (!isAuthorised) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid internal service secret' } }, 401);
    }
    await next();
  };
