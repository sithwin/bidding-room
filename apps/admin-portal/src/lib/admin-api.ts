import { cookies } from 'next/headers';

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('AdminApiError');
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = cookies().get('admin_token')?.value ?? '';
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

  const json = await res.json();
  if (!res.ok) throw new AdminApiError(res.status, json);
  return json as T;
}

export const adminApi = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
