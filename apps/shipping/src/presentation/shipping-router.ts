import { Hono } from 'hono';
import { GetFulfilmentUseCase } from '../application/get-fulfilment.use-case';
import { ChooseShipUseCase } from '../application/choose-ship.use-case';
import { ChooseCollectUseCase } from '../application/choose-collect.use-case';
import { MarkDispatchedUseCase } from '../application/mark-dispatched.use-case';
import { MarkCollectedUseCase } from '../application/mark-collected.use-case';
import { JwtPayload } from '@carat-room/shared-auth';

interface UseCases {
  getFulfilment: GetFulfilmentUseCase;
  chooseShip: ChooseShipUseCase;
  chooseCollect: ChooseCollectUseCase;
  markDispatched: MarkDispatchedUseCase;
  markCollected: MarkCollectedUseCase;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

export function buildShippingRouter(useCases: UseCases): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get('/fulfilments/:id', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    try {
      const fulfilment = await useCases.getFulfilment.execute({ fulfilmentId: id, userId });
      const p = fulfilment.toProps();
      return c.json({
        data: {
          id: p.id,
          lotId: p.lotId,
          method: p.method,
          status: p.status,
          shippingAddress: p.shippingAddress,
          collectionSlot: p.collectionSlot,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/fulfilments/:id/choose-ship', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    const body = await c.req.json();

    const { fullName, line1, line2, city, state, postcode, country } = body;
    if (!fullName || !line1 || !city || !postcode || !country) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'fullName, line1, city, postcode and country are required' } },
        400,
      );
    }

    try {
      await useCases.chooseShip.execute({
        fulfilmentId: id,
        userId,
        address: { fullName, line1, line2: line2 ?? null, city, state: state ?? null, postcode, country },
      });
      return c.json({ data: { success: true } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      if (message === 'Fulfilment method already chosen') {
        return c.json({ error: { code: 'CONFLICT', message: 'Fulfilment method already chosen' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/fulfilments/:id/choose-collect', async (c) => {
    const { userId } = c.get('jwtPayload');
    const { id } = c.req.param();
    const body = await c.req.json();

    const { location, date, timeSlot } = body;
    if (!location || !date || !timeSlot) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'location, date and timeSlot are required' } },
        400,
      );
    }

    try {
      await useCases.chooseCollect.execute({ fulfilmentId: id, userId, slot: { location, date, timeSlot } });
      return c.json({ data: { success: true } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Forbidden') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }
      if (message === 'Fulfilment not found') {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Fulfilment not found' } }, 404);
      }
      if (message === 'Fulfilment method already chosen') {
        return c.json({ error: { code: 'CONFLICT', message: 'Fulfilment method already chosen' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  return router;
}
