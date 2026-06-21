import type { MiddlewareHandler } from 'hono';
import { verifyJwt } from './verify.js';
import type { JwtPayload } from './verify.js';

interface AuthOptions {
  adminOnly?: boolean;
}

export function authMiddleware(publicKey: string, options: AuthOptions = {}): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json(
        { error: { code: 'UNAUTHORISED', message: 'Missing or invalid authorisation header' } },
        401,
      );
    }

    const token = authHeader.slice(7);
    let payload: JwtPayload;

    try {
      payload = await verifyJwt(token, publicKey);
    } catch {
      return c.json(
        { error: { code: 'UNAUTHORISED', message: 'Invalid or expired token' } },
        401,
      );
    }

    if (options.adminOnly && payload.role !== 'ADMIN') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        403,
      );
    }

    c.set('jwtPayload', payload);
    await next();
  };
}
