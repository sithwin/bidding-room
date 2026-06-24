import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApi, ApiError } from './api';

const mockGetToken = vi.fn<[], string | null>();

beforeEach(() => {
  mockGetToken.mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn());
});

describe('createApi', () => {
  describe('ApiError', () => {
    it('stores status and body', () => {
      const err = new ApiError(404, { message: 'Not found' });
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ message: 'Not found' });
      expect(err.message).toBe('API error 404');
    });
  });

  describe('get', () => {
    it('sends GET with Content-Type header and no auth when no token', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const api = createApi(() => null);
      const result = await api.get<{ data: string }>('/api/lots');

      expect(fetchMock).toHaveBeenCalledWith('/api/lots', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: undefined,
      });
      expect(result).toEqual({ data: 'test' });
    });

    it('includes Authorization header when token is present', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const api = createApi(() => 'my-access-token');
      await api.get('/api/account');

      expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer my-access-token',
        },
      }));
    });

    it('throws ApiError on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorised' }),
      }));

      const api = createApi(() => null);
      await expect(api.get('/api/protected')).rejects.toThrow(ApiError);

      try {
        await api.get('/api/protected');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(401);
        expect((err as ApiError).body).toEqual({ error: 'Unauthorised' });
      }
    });
  });

  describe('post', () => {
    it('sends POST with JSON-serialised body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: '123' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const api = createApi(() => 'tok');
      await api.post('/api/bids', { lotId: 'lot1', amount: 100 });

      expect(fetchMock).toHaveBeenCalledWith('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer tok',
        },
        body: JSON.stringify({ lotId: 'lot1', amount: 100 }),
      });
    });
  });

  describe('patch', () => {
    it('sends PATCH with body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const api = createApi(() => 'tok');
      await api.patch('/api/account/profile', { name: 'Alice' });

      expect(fetchMock).toHaveBeenCalledWith('/api/account/profile', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Alice' }),
      }));
    });
  });

  describe('delete', () => {
    it('sends DELETE with no body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const api = createApi(() => 'tok');
      await api.delete('/api/watchlist/item1');

      expect(fetchMock).toHaveBeenCalledWith('/api/watchlist/item1', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer tok',
        },
        body: undefined,
      });
    });
  });
});
