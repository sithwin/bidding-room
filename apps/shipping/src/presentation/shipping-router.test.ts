import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { buildShippingRouter } from './shipping-router';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ListFulfilmentsUseCase } from '../application/list-fulfilments.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { Fulfilment, FulfilmentMethod, FulfilmentStatus } from '../domain/fulfilment';
import { JwtPayload } from '@carat-room/shared-auth';
import {
  apiErrorSchema, chooseShipRequestSchema, fulfilmentIdResponseSchema, fulfilmentListResponseSchema,
  fulfilmentResponseSchema, fulfilmentsQuery, fulfilmentSuccessResponseSchema, pendingCountResponseSchema,
} from '@carat-room/shared-types';

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

const chooseShipBody = {
  fullName: 'Jane Smith',
  line1: '1 Queen St',
  city: 'Melbourne',
  postcode: '3000',
  country: 'AU',
} satisfies z.infer<typeof chooseShipRequestSchema>;

describe('GET /api/shipping/fulfilments', () => {
  it('should_return200WithList_when_adminRequestsByStatus', async () => {
    const useCases = makeUseCases();
    const fulfilment = Fulfilment.create({ id: 'f-1', lotId: 'lot-1', userId: 'user-1' });
    (useCases.listFulfilments.execute as ReturnType<typeof vi.fn>).mockResolvedValue([fulfilment]);

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request(`/api/shipping/fulfilments?${fulfilmentsQuery({ status: 'PENDING_DISPATCH' })}`);
    const body = fulfilmentListResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('f-1');
  });
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
    const body = fulfilmentResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('f-1');
    expect(body.data.status).toBe(FulfilmentStatus.PENDING_CHOICE);
  });

  it('should_return200WithPopulatedAddress_when_shipFulfilmentFound', async () => {
    const useCases = makeUseCases();
    const fulfilment = Fulfilment.reconstitute({
      id: 'f-2',
      lotId: 'lot-2',
      userId: 'user-1',
      method: FulfilmentMethod.SHIP,
      status: FulfilmentStatus.PENDING_DISPATCH,
      shippingAddress: {
        id: 'addr-1',
        fulfilmentId: 'f-2',
        fullName: 'Jane Smith',
        line1: '1 Queen St',
        line2: 'Unit 2',
        city: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        country: 'AU',
      },
      collectionSlot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (useCases.getFulfilment.execute as ReturnType<typeof vi.fn>).mockResolvedValue(fulfilment);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-2');
    const body = fulfilmentResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.shippingAddress?.line2).toBe('Unit 2');
    expect(body.data.shippingAddress?.state).toBe('VIC');
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
      body: JSON.stringify(chooseShipBody),
    });
    const body = fulfilmentSuccessResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
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
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/shipping/fulfilments/:id/choose-collect', () => {
  it('should_return200_when_slotSubmitted', async () => {
    const useCases = makeUseCases();
    (useCases.chooseCollect.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Melbourne showroom', date: '2026-08-01', timeSlot: '10:00-11:00' }),
    });
    const body = fulfilmentSuccessResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
  });

  it('should_return400_when_requiredFieldsMissing', async () => {
    const useCases = makeUseCases();
    const app = new Hono();
    app.use('*', jwtMiddleware());
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/choose-collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Melbourne showroom' }),
    });
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/shipping/fulfilments/:id/dispatch', () => {
  it('should_return200_when_markedDispatched', async () => {
    const useCases = makeUseCases();
    (useCases.markDispatched.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/dispatch', { method: 'PATCH' });
    const body = fulfilmentIdResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('f-1');
  });

  it('should_return404_when_fulfilmentNotFound', async () => {
    const useCases = makeUseCases();
    (useCases.markDispatched.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Fulfilment not found'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/dispatch', { method: 'PATCH' });
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(404);
    expect(body.error.message).toBe('Fulfilment not found');
  });

  it('should_return409_when_notPendingDispatch', async () => {
    const useCases = makeUseCases();
    (useCases.markDispatched.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Cannot dispatch: fulfilment not pending dispatch'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/dispatch', { method: 'PATCH' });
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
  });
});

describe('PATCH /api/shipping/fulfilments/:id/collect', () => {
  it('should_return200_when_markedCollected', async () => {
    const useCases = makeUseCases();
    (useCases.markCollected.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/collect', { method: 'PATCH' });
    const body = fulfilmentIdResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('f-1');
  });

  it('should_return404_when_fulfilmentNotFound', async () => {
    const useCases = makeUseCases();
    (useCases.markCollected.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Fulfilment not found'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/collect', { method: 'PATCH' });
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(404);
    expect(body.error.message).toBe('Fulfilment not found');
  });

  it('should_return409_when_notPendingDispatch', async () => {
    const useCases = makeUseCases();
    (useCases.markCollected.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Cannot mark collected: fulfilment not pending dispatch'),
    );

    const app = new Hono();
    app.use('*', jwtMiddleware('admin-1', 'ADMIN'));
    app.route('/api/shipping', buildShippingRouter(useCases));

    const res = await app.request('/api/shipping/fulfilments/f-1/collect', { method: 'PATCH' });
    const body = apiErrorSchema.parse(await res.json());

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
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
    const body = pendingCountResponseSchema.parse(await res.json());

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
