import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildShippingRouter } from './shipping-router';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ListFulfilmentsUseCase } from '../application/list-fulfilments.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { Fulfilment, FulfilmentStatus } from '../domain/fulfilment';
import { JwtPayload } from '@carat-room/shared-auth';

const makeUseCases = () => ({
  getFulfilment: { execute: vi.fn() } as unknown as GetFulfilmentUseCase,
  listFulfilments: { execute: vi.fn() } as unknown as ListFulfilmentsUseCase,
  chooseShip: { execute: vi.fn() } as unknown as ChooseShipUseCase,
  chooseCollect: { execute: vi.fn() } as unknown as ChooseCollectUseCase,
  markDispatched: { execute: vi.fn() } as unknown as MarkDispatchedUseCase,
  markCollected: { execute: vi.fn() } as unknown as MarkCollectedUseCase,
  countPendingFulfilments: vi.fn(),
});

const jwtMiddleware = (userId = 'user-1', role = 'BUYER') =>
  vi.fn(async (c: any, next: any) => {
    c.set('jwtPayload', { userId, role } as JwtPayload);
    await next();
  });

describe('GET /api/shipping/fulfilments/:id', () => {
  it('should_return200_when_fulfilmentFound', async () => {
    const useCases = makeUseCases();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (useCases.getFulfilment.execute as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('f-1');
    expect(body.data.status).toBe(FulfilmentStatus.PENDING_CHOICE);
  });
});

describe('POST /api/shipping/fulfilments/:id/choose-ship', () => {
  it('should_return200_when_addressSubmitted', async () => {
    const useCases = makeUseCases();
    (useCases.chooseShip.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-ship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        city: 'Melbourne',
        postcode: '3000',
        country: 'AU',
      }),
    });

    expect(res.status).toBe(200);
  });

  it('should_return400_when_requiredFieldsMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-ship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Jane' }),
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/shipping/fulfilments/pending-count', () => {
  it('should_return200WithCount_when_adminRequests', async () => {
    const useCases = makeUseCases();
    useCases.countPendingFulfilments.mockResolvedValue(5);

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/pending-count');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.count).toBe(5);
  });

  it('should_return403_when_nonAdminRequests', async () => {
    const useCases = makeUseCases();

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/pending-count');

    expect(res.status).toBe(403);
  });

  it('should_notBeSwallowed_when_getFulfilmentByIdRouteRegistered', async () => {
    const useCases = makeUseCases();
    useCases.countPendingFulfilments.mockResolvedValue(2);

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/pending-count');

    expect(res.status).toBe(200);
    expect(useCases.getFulfilment.execute).not.toHaveBeenCalled();
  });
});
