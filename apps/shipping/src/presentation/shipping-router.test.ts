import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { buildShippingRouter } from './shipping-router';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { Fulfilment, FulfilmentStatus } from '../domain/fulfilment';
import { JwtPayload } from '@carat-room/shared-auth';

const makeUseCases = () => ({
  getFulfilment: { execute: vi.fn() } as unknown as GetFulfilmentUseCase,
  chooseShip: { execute: vi.fn() } as unknown as ChooseShipUseCase,
  chooseCollect: { execute: vi.fn() } as unknown as ChooseCollectUseCase,
  markDispatched: { execute: vi.fn() } as unknown as MarkDispatchedUseCase,
  markCollected: { execute: vi.fn() } as unknown as MarkCollectedUseCase,
});

const jwtMiddleware = (userId = 'user-1') =>
  vi.fn(async (c: any, next: any) => {
    c.set('jwtPayload', { userId, role: 'BUYER' } as JwtPayload);
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
