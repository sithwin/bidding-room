import type { JwtPayload } from '@carat-room/shared-auth';

/** Decodes (does not verify) the payload of a JWT. Callers already trust the
 * token's source (it was just issued by our own login/refresh proxy). */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as JwtPayload;
  } catch {
    return null;
  }
}
