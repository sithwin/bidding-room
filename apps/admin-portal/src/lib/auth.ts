import { cookies } from 'next/headers';
import { ADMIN_TOKEN_COOKIE } from './auth-cookie';

export async function getAdminToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value;
}
