import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { ServiceClient, ServiceError } from '../infrastructure/service-client';
import { buildLotsRouter } from './lots-router';
import { buildCategoriesRouter } from './categories-router';
import { buildAuctionsRouter } from './auctions-router';
import { buildUsersRouter } from './users-router';
import { buildInvoicesRouter } from './invoices-router';
import { buildFulfilmentsRouter } from './fulfilments-router';
import { buildReportsRouter } from './reports-router';

vi.mock('@carat-room/shared-auth', () => ({
  authMiddleware: () => async (
    c: { set: (k: string, v: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set('jwtPayload', { sub: 'admin-1', role: 'ADMIN' });
    await next();
  },
}));

vi.mock('../infrastructure/service-client', async (importActual) => {
  const actual = await importActual<typeof import('../infrastructure/service-client')>();
  return {
    ...actual,
    ServiceClient: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    })),
  };
});

let mockClient: ServiceClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = new ServiceClient('http://mock');
});

const authHeader = () => ({ Authorization: 'Bearer admin-token' });

describe('Lots router', () => {
  it('should_return200_when_listingLots', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots?status=DRAFT', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith('/api/lots?status=DRAFT', 'admin-token');
  });

  it('should_return200_when_fetchingSingleLot', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: { id: 'lot-1' } });
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots/lot-1', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith('/api/lots/lot-1', 'admin-token');
  });

  it('should_return200_when_postingNewLot', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'lot-1' } });
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Diamond Ring' }),
    });

    expect(res.status).toBe(200);
    expect(mockClient.post).toHaveBeenCalledWith('/api/lots', 'admin-token', expect.any(Object));
  });

  it('should_propagateStatusCode_when_downstreamReturnsError', async () => {
    vi.mocked(mockClient.patch).mockRejectedValue(new ServiceError(404, { error: { code: 'NOT_FOUND' } }));
    const app = new Hono().route('/', buildLotsRouter(mockClient));

    const res = await app.request('/admin/api/lots/lot-1', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('Categories router', () => {
  it('should_return200_when_listingCategories', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith('/api/categories', 'admin-token');
  });

  it('should_return200_when_creatingCategory', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'cat-1' } });
    const app = new Hono().route('/', buildCategoriesRouter(mockClient));

    const res = await app.request('/admin/api/categories', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rings', slug: 'rings' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Auctions router', () => {
  it('should_return200_when_schedulingAuction', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { lotId: 'lot-1' } });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: 'lot-1', startAt: '2026-07-01T10:00:00Z', endAt: '2026-07-01T12:00:00Z', reservePrice: 500, minBidIncrement: 10, autoExtendWindowMinutes: 3, autoExtendDurationMinutes: 3 }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_listingAuctions', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildAuctionsRouter(mockClient));

    const res = await app.request('/admin/api/auctions', { headers: authHeader() });

    expect(res.status).toBe(200);
  });
});

describe('Users router', () => {
  it('should_return200_when_listingUsers', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildUsersRouter(mockClient));

    const res = await app.request('/admin/api/users', { headers: authHeader() });

    expect(res.status).toBe(200);
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/users'), 'admin-token');
  });

  it('should_return200_when_suspendingUser', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'user-1' } });
    const app = new Hono().route('/', buildUsersRouter(mockClient));

    const res = await app.request('/admin/api/users/user-1/suspend', {
      method: 'PATCH',
      headers: authHeader(),
    });

    expect(res.status).toBe(200);
    expect(mockClient.patch).toHaveBeenCalledWith('/api/users/user-1/suspend', 'admin-token', undefined);
  });

  it('should_return200_when_creatingUser', async () => {
    vi.mocked(mockClient.post).mockResolvedValue({ data: { id: 'user-1' } });
    const app = new Hono().route('/', buildUsersRouter(mockClient));
    const body = { email: 'new@example.com', firstName: 'New', lastName: 'User' };

    const res = await app.request('/admin/api/users', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockClient.post).toHaveBeenCalledWith('/api/users', 'admin-token', body);
  });

  it('should_return200_when_updatingUser', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'user-1' } });
    const app = new Hono().route('/', buildUsersRouter(mockClient));
    const body = { firstName: 'Updated' };

    const res = await app.request('/admin/api/users/user-1', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(200);
    expect(mockClient.patch).toHaveBeenCalledWith('/api/users/user-1', 'admin-token', body);
  });

  it('should_propagateStatusCode_when_creatingUserConflicts', async () => {
    vi.mocked(mockClient.post).mockRejectedValue(new ServiceError(409, { error: { code: 'CONFLICT', message: 'Email already exists' } }));
    const app = new Hono().route('/', buildUsersRouter(mockClient));

    const res = await app.request('/admin/api/users', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@example.com', firstName: 'Dup', lastName: 'User' }),
    });

    expect(res.status).toBe(409);
  });
});

describe('Invoices router', () => {
  it('should_return200_when_listingInvoices', async () => {
    vi.mocked(mockClient.get).mockResolvedValue({ data: [] });
    const app = new Hono().route('/', buildInvoicesRouter({ payment: mockClient, catalogue: mockClient, user: mockClient }));

    const res = await app.request('/admin/api/invoices', { headers: authHeader() });

    expect(res.status).toBe(200);
  });

  it('should_return200_when_cancellingInvoice', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'inv-1' } });
    const app = new Hono().route('/', buildInvoicesRouter({ payment: mockClient, catalogue: mockClient, user: mockClient }));

    const res = await app.request('/admin/api/invoices/inv-1/cancel', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Customer request' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Fulfilments router', () => {
  it('should_return200_when_dispatchingFulfilment', async () => {
    vi.mocked(mockClient.patch).mockResolvedValue({ data: { id: 'ful-1' } });
    const app = new Hono().route('/', buildFulfilmentsRouter({ shipping: mockClient, catalogue: mockClient, user: mockClient }));

    const res = await app.request('/admin/api/fulfilments/ful-1/dispatch', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber: 'TRK123', carrier: 'AusPost' }),
    });

    expect(res.status).toBe(200);
  });

});

describe('Reports router', () => {
  it('should_return200_when_fetchingRevenueReport', async () => {
    const payment = new ServiceClient('http://mock');
    const catalogue = new ServiceClient('http://mock');
    const user = new ServiceClient('http://mock');
    vi.mocked(payment.get).mockResolvedValue({ data: { byCurrency: { GBP: 100 } } });
    const app = new Hono().route('/', buildReportsRouter({ auction: mockClient, payment, catalogue, user }));

    const res = await app.request('/admin/api/reports/revenue', { headers: authHeader() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(payment.get).toHaveBeenCalledWith('/api/payments/reports/revenue', 'admin-token');
    expect(body).toEqual({ data: { byCurrency: { GBP: 100 } } });
  });

  it('should_enrichAndSummarise_when_fetchingAuctionResults', async () => {
    const auction = new ServiceClient('http://mock');
    const payment = new ServiceClient('http://mock');
    const catalogue = new ServiceClient('http://mock');
    const user = new ServiceClient('http://mock');

    vi.mocked(auction.get).mockResolvedValue({
      data: [
        { lotId: 'lot-1', finalBid: 1000, reserveMet: true, winnerUserId: 'u1', closedAt: '2026-06-15T10:00:00Z' },
        { lotId: 'lot-2', finalBid: null, reserveMet: false, winnerUserId: null, closedAt: '2026-06-16T10:00:00Z' },
      ],
    });
    vi.mocked(catalogue.get).mockImplementation(async (url: string) => {
      if (url === '/api/categories') {
        return { data: [{ id: 'cat-1', name: 'Rings' }] };
      }
      if (url === '/api/lots/lot-1') {
        return { data: { title: 'Diamond Ring', categoryId: 'cat-1' } };
      }
      if (url === '/api/lots/lot-2') {
        return { data: { title: 'Sapphire Necklace', categoryId: 'cat-1' } };
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.mocked(user.get).mockResolvedValue({ email: 'winner@example.com' });

    const app = new Hono().route('/', buildReportsRouter({ auction, payment, catalogue, user }));

    const res = await app.request('/admin/api/reports/auction-results?from=2026-06-01&to=2026-07-01', { headers: authHeader() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(auction.get).toHaveBeenCalledWith('/api/reports/results?from=2026-06-01&to=2026-07-01', 'admin-token');
    expect(body.data.rows).toEqual([
      { lotTitle: 'Diamond Ring', categoryName: 'Rings', finalBid: 1000, reserveMet: true, winnerEmail: 'winner@example.com' },
      { lotTitle: 'Sapphire Necklace', categoryName: 'Rings', finalBid: null, reserveMet: false, winnerEmail: null },
    ]);
    expect(body.data.summary).toEqual({ totalLots: 2, soldPercent: 50, totalValue: 1000 });
  });

  it('should_enrichUnsoldRows_when_fetchingUnsoldReport', async () => {
    const auction = new ServiceClient('http://mock');
    const payment = new ServiceClient('http://mock');
    const catalogue = new ServiceClient('http://mock');
    const user = new ServiceClient('http://mock');

    vi.mocked(auction.get).mockResolvedValue({
      data: [{ lotId: 'lot-3', highestBid: 250 }],
    });
    vi.mocked(catalogue.get).mockImplementation(async (url: string) => {
      if (url === '/api/categories') {
        return { data: [{ id: 'cat-2', name: 'Bags' }] };
      }
      if (url === '/api/lots/lot-3') {
        return { data: { title: 'Leather Tote', categoryId: 'cat-2' } };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const app = new Hono().route('/', buildReportsRouter({ auction, payment, catalogue, user }));

    const res = await app.request('/admin/api/reports/unsold', { headers: authHeader() });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(auction.get).toHaveBeenCalledWith('/api/reports/unsold', 'admin-token');
    expect(body.data).toEqual([
      { id: 'lot-3', title: 'Leather Tote', categoryName: 'Bags', highestBid: 250 },
    ]);
  });
});
