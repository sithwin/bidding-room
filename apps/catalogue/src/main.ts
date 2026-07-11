import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { createDb } from './infrastructure/db';
import { PostgresLotRepository } from './infrastructure/postgres-lot-repository';
import { PostgresCategoryRepository } from './infrastructure/postgres-category-repository';
import { PostgresSearchRepository } from './infrastructure/postgres-search-repository';
import { R2ImageStorage } from './infrastructure/r2-image-storage';
import { GetLotUseCase } from './application/get-lot-use-case';
import { ListLotsUseCase } from './application/list-lots-use-case';
import { SearchLotsUseCase } from './application/search-lots-use-case';
import { ListCategoriesUseCase } from './application/list-categories-use-case';
import { RequestImageUploadUseCase } from './application/request-image-upload-use-case';
import { ConfirmImageUploadUseCase } from './application/confirm-image-upload-use-case';
import { CreateLotUseCase } from './application/create-lot-use-case';
import { UpdateLotUseCase } from './application/update-lot-use-case';
import { CreateCategoryUseCase } from './application/create-category-use-case';
import { RenameCategoryUseCase } from './application/rename-category-use-case';
import { DeleteCategoryUseCase } from './application/delete-category-use-case';
import { buildCatalogueRouter } from './presentation/catalogue-router';
import { buildAuctionRouter } from './presentation/auction-router';
import { buildFacetsRouter } from './presentation/facets-router';
import { PostgresAuctionRepository } from './infrastructure/postgres-auction-repository';
import { PostgresFacetRepository } from './infrastructure/postgres-facet-repository';
import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError, LotNotFoundError } from './domain/errors';
import { LotCondition } from './domain/lot';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const PORT = Number(process.env.PORT ?? 3002);
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost/catalogue';
const jwtPublicKey = (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');

const db = createDb(databaseUrl);

const lotRepository = new PostgresLotRepository(db);
const categoryRepository = new PostgresCategoryRepository(db);
const searchRepository = new PostgresSearchRepository(db);
const auctionRepository = new PostgresAuctionRepository(db);
const facetRepository = new PostgresFacetRepository(db);

const imageStorage = new R2ImageStorage({
  bucket: process.env.R2_BUCKET ?? '',
  accountId: process.env.R2_ACCOUNT_ID ?? '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? '',
});

const useCases = {
  getLot: new GetLotUseCase(lotRepository),
  listLots: new ListLotsUseCase(lotRepository),
  searchLots: new SearchLotsUseCase(searchRepository),
  listCategories: new ListCategoriesUseCase(categoryRepository),
  requestImageUpload: new RequestImageUploadUseCase(imageStorage),
  confirmImageUpload: new ConfirmImageUploadUseCase(lotRepository, imageStorage),
  createLot: new CreateLotUseCase(lotRepository),
  updateLot: new UpdateLotUseCase(lotRepository),
  createCategory: new CreateCategoryUseCase(categoryRepository),
  renameCategory: new RenameCategoryUseCase(categoryRepository),
  deleteCategory: new DeleteCategoryUseCase(categoryRepository),
};

const app = new Hono<AppEnv>();

app.get('/health', c => c.json({ status: 'ok', service: 'catalogue' }));

app.use('/api/lots/:id/images/*', authMiddleware(jwtPublicKey));
app.post('/api/lots', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  const jwtPayload = c.get('jwtPayload');
  const body = await c.req.json() as {
    title?: string;
    description?: string;
    categoryId?: string;
    condition?: string;
    estimatedValue?: number;
    status?: string;
  };
  if (!body.title?.trim()) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
  }
  if (body.status !== undefined && body.status !== 'ACTIVE' && body.status !== 'INACTIVE') {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be ACTIVE or INACTIVE' } }, 400);
  }
  const result = await useCases.createLot.execute({
    title: body.title,
    description: body.description,
    categoryId: body.categoryId,
    condition: body.condition,
    estimatedValue: body.estimatedValue,
    status: body.status as 'ACTIVE' | 'INACTIVE' | undefined,
    createdBy: jwtPayload.userId,
  });
  return c.json({ data: result }, 201);
});

app.patch('/api/lots/:id', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  const body = await c.req.json() as {
    title?: string;
    description?: string;
    categoryId?: string;
    condition?: string;
    estimatedValue?: number;
    status?: string;
  };
  if (body.status !== undefined && body.status !== 'ACTIVE' && body.status !== 'INACTIVE') {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'status must be ACTIVE or INACTIVE' } }, 400);
  }
  try {
    await useCases.updateLot.execute(c.req.param('id'), {
      title: body.title,
      description: body.description,
      categoryId: body.categoryId,
      condition: body.condition as LotCondition | undefined,
      estimatedValue: body.estimatedValue,
      status: body.status as 'ACTIVE' | 'INACTIVE' | undefined,
    });
    return c.json({ data: null });
  } catch (err) {
    if (err instanceof LotNotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
    }
    throw err;
  }
});

app.post('/api/categories', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  const body = await c.req.json() as { name?: string; slug?: string; parentId?: string };
  if (!body.name?.trim()) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);
  }
  if (!body.slug?.trim()) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'slug is required' } }, 400);
  }
  try {
    const category = await useCases.createCategory.execute({ name: body.name, slug: body.slug, parentId: body.parentId });
    return c.json({ data: category }, 201);
  } catch (err) {
    if (err instanceof CategorySlugConflictError) {
      return c.json({ error: { code: 'SLUG_CONFLICT', message: err.message } }, 409);
    }
    throw err;
  }
});

app.patch('/api/categories/:id', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  const body = await c.req.json() as { name?: string };
  if (!body.name?.trim()) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'name is required' } }, 400);
  }
  try {
    await useCases.renameCategory.execute(c.req.param('id'), body.name);
    return c.json({ data: null });
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
    }
    throw err;
  }
});

app.delete('/api/categories/:id', authMiddleware(jwtPublicKey, { adminOnly: true }), async c => {
  try {
    await useCases.deleteCategory.execute(c.req.param('id'));
    return c.json({ data: null });
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
    }
    if (err instanceof CategoryHasLotsError) {
      return c.json({ error: { code: 'CATEGORY_HAS_LOTS', message: err.message } }, 409);
    }
    throw err;
  }
});

app.route('/', buildCatalogueRouter(useCases));
app.route('/', buildAuctionRouter({ auctionRepository }));
app.route('/', buildFacetsRouter({ facetRepository }));

serve({ fetch: app.fetch, port: PORT });
