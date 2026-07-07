import { cookies } from 'next/headers';
import { ADMIN_TOKEN_COOKIE } from './auth-cookie';

export function getAdminToken(): string | undefined {
  return cookies().get(ADMIN_TOKEN_COOKIE)?.value;
}
