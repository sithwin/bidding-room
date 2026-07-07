import { cookies } from 'next/headers';
import { ADMIN_TOKEN_COOKIE } from './auth-cookie';

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('AdminApiError');
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? '';
  const baseUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON upstream response (e.g. plain-text 404) must not crash the page render
    json = { error: { code: 'UPSTREAM_ERROR', message: text.slice(0, 200) } };
  }
  if (!res.ok) throw new AdminApiError(res.status, json);
  return json as T;
}

export const adminApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
