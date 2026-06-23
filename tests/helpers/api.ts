type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  port: number,
  method: HttpMethod,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let responseBody: T;
  const text = await res.text();
  try {
    responseBody = JSON.parse(text) as T;
  } catch {
    responseBody = text as unknown as T;
  }

  return { status: res.status, body: responseBody };
}

/** Thin HTTP client for a service running on the given port. */
export function api(port: number) {
  return {
    get: <T>(path: string, token?: string) =>
      request<T>(port, 'GET', path, undefined, token),
    post: <T>(path: string, body: unknown, token?: string) =>
      request<T>(port, 'POST', path, body, token),
    patch: <T>(path: string, body: unknown, token?: string) =>
      request<T>(port, 'PATCH', path, body, token),
    delete: <T>(path: string, token?: string) =>
      request<T>(port, 'DELETE', path, undefined, token),
  };
}
