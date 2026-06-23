import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ServiceClient } from './infrastructure/service-client';
import { buildLotsRouter } from './presentation/lots-router';
import { buildCategoriesRouter } from './presentation/categories-router';
import { buildAuctionsRouter } from './presentation/auctions-router';
import { buildUsersRouter } from './presentation/users-router';
import { buildInvoicesRouter } from './presentation/invoices-router';
import { buildFulfilmentsRouter } from './presentation/fulfilments-router';
import { buildReportsRouter } from './presentation/reports-router';

const PORT = Number(process.env['PORT'] ?? 3007);

const catalogue = new ServiceClient(process.env['CATALOGUE_SERVICE_URL'] ?? 'http://catalogue-service:3002');
const auction   = new ServiceClient(process.env['AUCTION_SERVICE_URL']   ?? 'http://auction-service:3003');
const user      = new ServiceClient(process.env['USER_SERVICE_URL']      ?? 'http://user-service:3001');
const payment   = new ServiceClient(process.env['PAYMENT_SERVICE_URL']   ?? 'http://payment-service:3004');
const shipping  = new ServiceClient(process.env['SHIPPING_SERVICE_URL']  ?? 'http://shipping-service:3006');

const app = new Hono();
app.route('/', buildLotsRouter(catalogue));
app.route('/', buildCategoriesRouter(catalogue));
app.route('/', buildAuctionsRouter(auction));
app.route('/', buildUsersRouter(user));
app.route('/', buildInvoicesRouter(payment));
app.route('/', buildFulfilmentsRouter(shipping));
app.route('/', buildReportsRouter(auction));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Admin service running on port ${PORT}`);
});
