export class ServiceError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super('ServiceError');
  }
}

export class ServiceClient {
  constructor(private readonly baseUrl: string) {}

  async get<T>(path: string, token: string): Promise<T> {
    return this.request<T>('GET', path, token);
  }

  async post<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, token, body);
  }

  async patch<T>(path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, token, body);
  }

  async delete<T>(path: string, token: string): Promise<T> {
    return this.request<T>('DELETE', path, token);
  }

  private async request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new ServiceError(res.status, json);
    }
    return json as T;
  }
}
