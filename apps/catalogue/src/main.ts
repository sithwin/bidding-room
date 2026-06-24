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
import { buildCatalogueRouter } from './presentation/catalogue-router';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const PORT = Number(process.env.PORT ?? 3002);
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost/catalogue';
const jwtPublicKey = (process.env.JWT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');

const db = createDb(databaseUrl);

const lotRepository = new PostgresLotRepository(db);
const categoryRepository = new PostgresCategoryRepository(db);
const searchRepository = new PostgresSearchRepository(db);

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
  };
  if (!body.title?.trim()) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'title is required' } }, 400);
  }
  const result = await useCases.createLot.execute({
    title: body.title,
    description: body.description,
    categoryId: body.categoryId,
    condition: body.condition,
    estimatedValue: body.estimatedValue,
    createdBy: jwtPayload.userId,
  });
  return c.json({ data: result }, 201);
});

app.route('/', buildCatalogueRouter(useCases));

serve({ fetch: app.fetch, port: PORT });
