import { Hono } from 'hono';
import type { JwtPayload } from '@carat-room/shared-auth';
import { GetLotUseCase } from '../application/get-lot-use-case';
import { ListLotsUseCase } from '../application/list-lots-use-case';
import { SearchLotsUseCase } from '../application/search-lots-use-case';
import { ListCategoriesUseCase } from '../application/list-categories-use-case';
import { RequestImageUploadUseCase } from '../application/request-image-upload-use-case';
import { ConfirmImageUploadUseCase } from '../application/confirm-image-upload-use-case';
import { DeleteImageUseCase } from '../application/delete-image-use-case';
import { ReorderImagesUseCase } from '../application/reorder-images-use-case';
import { Lot, LotCondition } from '../domain/lot';
import { LotNotFoundError, LotImageNotFoundError, ImageOrderMismatchError } from '../domain/errors';

interface UseCases {
  getLot: Pick<GetLotUseCase, 'execute'>;
  listLots: Pick<ListLotsUseCase, 'execute'>;
  searchLots: Pick<SearchLotsUseCase, 'execute'>;
  listCategories: Pick<ListCategoriesUseCase, 'execute'>;
  requestImageUpload: Pick<RequestImageUploadUseCase, 'execute'>;
  confirmImageUpload: Pick<ConfirmImageUploadUseCase, 'execute'>;
  deleteImage: Pick<DeleteImageUseCase, 'execute'>;
  reorderImages: Pick<ReorderImagesUseCase, 'execute'>;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const VALID_CONDITIONS = new Set<string>(Object.values(LotCondition));
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toLotResponse(lot: Lot) {
  return {
    id: lot.id,
    title: lot.title,
    description: lot.description,
    auctionId: lot.auctionId,
    categoryId: lot.categoryId,
    condition: lot.condition,
    estimatedValue: lot.estimatedValue,
    status: lot.status,
    images: lot.images.map(img => ({
      id: img.id,
      lotId: img.lotId,
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      displayOrder: img.displayOrder,
      isPrimary: img.isPrimary,
    })),
    createdBy: lot.createdBy,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

export function buildCatalogueRouter(useCases: UseCases): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  // Must be registered before /api/lots/:id to prevent 'search' matching as :id param
  router.get('/api/lots/search', async c => {
    const q = c.req.query('q') ?? '';
    if (!q.trim()) {
      return c.json({ error: { code: 'MISSING_QUERY', message: 'q parameter is required' } }, 400);
    }
    const categoryId = c.req.query('categoryId');
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Number(c.req.query('offset') ?? 0);

    const result = await useCases.searchLots.execute(q, categoryId, limit, offset);
    return c.json({ data: result.items, meta: { total: result.total, limit, offset } });
  });

  router.get('/api/lots/:id', async c => {
    const lot = await useCases.getLot.execute(c.req.param('id'));
    if (!lot) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    return c.json({ data: toLotResponse(lot) });
  });

  router.get('/api/lots', async c => {
    const auctionId = c.req.query('auctionId');
    const categoryId = c.req.query('categoryId');
    const conditionParam = c.req.query('condition');
    const condition =
      conditionParam && VALID_CONDITIONS.has(conditionParam)
        ? (conditionParam as LotCondition)
        : undefined;
    const minEstimatedValue = c.req.query('minValue') ? Number(c.req.query('minValue')) : undefined;
    const maxEstimatedValue = c.req.query('maxValue') ? Number(c.req.query('maxValue')) : undefined;
    const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Number(c.req.query('offset') ?? 0);

    const result = await useCases.listLots.execute(
      { auctionId, categoryId, condition, minEstimatedValue, maxEstimatedValue },
      limit,
      offset,
    );
    return c.json({ data: result.items.map(toLotResponse), meta: { total: result.total, limit, offset } });
  });

  router.get('/api/categories', async c => {
    const categories = await useCases.listCategories.execute();
    return c.json({ data: categories });
  });

  router.post('/api/lots/:id/images/upload-url', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { contentType?: string };
    if (!body.contentType) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'contentType is required' } }, 400);
    }
    const result = await useCases.requestImageUpload.execute(c.req.param('id'), body.contentType);
    return c.json({ data: result }, 201);
  });

  router.post('/api/lots/:id/images/confirm', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { imageKey?: string; isPrimary?: boolean };
    if (!body.imageKey) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'imageKey is required' } }, 400);
    }
    let createdImage;
    try {
      createdImage = await useCases.confirmImageUpload.execute(c.req.param('id'), body.imageKey, body.isPrimary ?? false);
    } catch (err) {
      if (err instanceof LotNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
      }
      throw err;
    }
    return c.json({ data: { id: createdImage.id, url: createdImage.url, thumbnailUrl: createdImage.thumbnailUrl, displayOrder: createdImage.displayOrder, isPrimary: createdImage.isPrimary } });
  });

  router.delete('/api/lots/:id/images/:imageId', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    try {
      await useCases.deleteImage.execute(c.req.param('id'), c.req.param('imageId'));
      return c.json({ data: null });
    } catch (err) {
      if (err instanceof LotNotFoundError || err instanceof LotImageNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
      }
      throw err;
    }
  });

  router.patch('/api/lots/:id/images/reorder', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { imageIds?: string[] };
    if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'imageIds is required' } }, 400);
    }
    try {
      await useCases.reorderImages.execute(c.req.param('id'), body.imageIds);
      return c.json({ data: null });
    } catch (err) {
      if (err instanceof LotNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
      }
      if (err instanceof ImageOrderMismatchError) {
        return c.json({ error: { code: 'IMAGE_ORDER_MISMATCH', message: err.message } }, 400);
      }
      throw err;
    }
  });

  return router;
}
