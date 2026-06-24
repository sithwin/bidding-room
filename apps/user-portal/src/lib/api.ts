export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`API error ${status}`);
  }
}

type GetToken = () => string | null;

async function request<T>(method: string, path: string, getToken: GetToken, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}

export function createApi(getToken: GetToken) {
  return {
    get:    <T>(path: string) => request<T>('GET', path, getToken),
    post:   <T>(path: string, body: unknown) => request<T>('POST', path, getToken, body),
    patch:  <T>(path: string, body: unknown) => request<T>('PATCH', path, getToken, body),
    delete: <T>(path: string) => request<T>('DELETE', path, getToken),
  };
}
