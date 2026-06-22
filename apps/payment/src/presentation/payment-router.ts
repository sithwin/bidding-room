import { Hono } from 'hono';
import { authMiddleware } from '@carat-room/shared-auth';
import type { JwtPayload } from '@carat-room/shared-auth';
import { GetInvoiceUseCase } from '../application/get-invoice-use-case';
import { CreateCheckoutSessionUseCase } from '../application/create-checkout-session-use-case';
import { HandleWebhookUseCase } from '../application/handle-webhook-use-case';

interface RouterDeps {
  getInvoice: Pick<GetInvoiceUseCase, 'execute'>;
  createCheckoutSession: Pick<CreateCheckoutSessionUseCase, 'execute'>;
  handleWebhook: Pick<HandleWebhookUseCase, 'execute'>;
  jwtPublicKey: string;
}

export function buildPaymentRouter(deps: RouterDeps): Hono {
  const router = new Hono();

  router.get('/api/payments/invoices/:id', authMiddleware(deps.jwtPublicKey), async (c) => {
    const payload = c.get('jwtPayload') as JwtPayload;
    const invoice = await deps.getInvoice.execute({
      invoiceId: c.req.param('id'),
      requestingUserId: payload.userId,
    });
    if (!invoice) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);
    }
    return c.json({ data: invoice });
  });

  router.post('/api/payments/invoices/:id/checkout', authMiddleware(deps.jwtPublicKey), async (c) => {
    const payload = c.get('jwtPayload') as JwtPayload;
    const body = await c.req.json<{ lotTitle: string }>();
    const result = await deps.createCheckoutSession.execute({
      invoiceId: c.req.param('id'),
      requestingUserId: payload.userId,
      lotTitle: body.lotTitle,
    });
    if (!result) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Invoice not found or not payable' } }, 404);
    }
    return c.json({ data: result });
  });

  router.post('/api/payments/webhooks/stripe', async (c) => {
    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const signature = c.req.header('stripe-signature') ?? '';
    try {
      await deps.handleWebhook.execute({ rawBody, signature });
      return c.json({ data: { received: true } });
    } catch {
      return c.json({ error: { code: 'WEBHOOK_ERROR', message: 'Invalid webhook signature' } }, 400);
    }
  });

  return router;
}
