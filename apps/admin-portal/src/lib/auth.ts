import { cookies } from 'next/headers';

export function getAdminToken(): string | undefined {
  return cookies().get('admin_token')?.value;
}
