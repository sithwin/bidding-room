import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServiceClient, ServiceError } from './service-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
afterEach(() => { vi.clearAllMocks(); });

describe('ServiceClient', () => {
  const client = new ServiceClient('http://catalogue-service:3001');

  it('should_returnParsedJson_when_responseIsOk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'lot-1' } }),
    });

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
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND' } }),
    });

    await expect(client.get('/api/lots/missing', 'token-abc')).rejects.toThrow(ServiceError);
  });

  it('should_sendBodyAsJson_when_posting', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { id: 'lot-2' } }) });

    await client.post('/api/lots', 'token-abc', { title: 'Ruby Ring' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://catalogue-service:3001/api/lots',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Ruby Ring' }) }),
    );
  });

  it('should_preserveStatusCode_when_serviceErrorThrown', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: { code: 'FORBIDDEN' } }),
    });

    const err = await client.get('/api/lots', 'bad-token').catch(e => e);

    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(403);
  });
});
