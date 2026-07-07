import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceClient, ServiceError } from './service-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => { vi.clearAllMocks(); });

const jsonResponse = (body: unknown, init: { ok: boolean; status?: number } = { ok: true }) => ({
  ok: init.ok,
  status: init.status ?? (init.ok ? 200 : 500),
  text: () => Promise.resolve(JSON.stringify(body)),
});

describe('ServiceClient', () => {
  const client = new ServiceClient('http://catalogue-service:3001');

  it('should_returnParsedJson_when_responseIsOk', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { id: 'lot-1' } }));

    const result = await client.get<{ data: { id: string } }>('/api/lots/lot-1', 'token-abc');

    expect(result).toEqual({ data: { id: 'lot-1' } });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://catalogue-service:3001/api/lots/lot-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
      }),
    );
  });

  it('should_throwServiceError_when_responseIsNotOk', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { code: 'NOT_FOUND' } }, { ok: false, status: 404 }));

    await expect(client.get('/api/lots/missing', 'token-abc')).rejects.toThrow(ServiceError);
  });

  it('should_sendBodyAsJson_when_posting', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { id: 'lot-2' } }));

    await client.post('/api/lots', 'token-abc', { title: 'Ruby Ring' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://catalogue-service:3001/api/lots',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Ruby Ring' }) }),
    );
  });

  it('should_preserveStatusCode_when_serviceErrorThrown', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { code: 'FORBIDDEN' } }, { ok: false, status: 403 }));

    const err = await client.get('/api/lots', 'bad-token').catch(e => e);

    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(403);
  });

  it('should_wrapNonJsonBody_when_downstreamReturnsPlainText', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('404 Not Found'),
    });

    const err = await client.get('/api/missing', 'token-abc').catch(e => e);

    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(404);
    expect((err as ServiceError).body).toEqual({
      error: { code: 'UPSTREAM_ERROR', message: '404 Not Found' },
    });
  });
});
