export const ADMIN_TOKEN_COOKIE = 'admin_token';

/**
 * Derives the cookie lifetime from the JWT's own exp claim so the cookie
 * never outlives the token. Returns 0 when the token is already expired
 * or carries no expiry.
 */
export function cookieMaxAgeFrom(exp: unknown): number {
  if (typeof exp !== 'number') return 0;
  return Math.max(0, exp - Math.floor(Date.now() / 1000));
}
