import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';
import { seedAdminUser, seedBuyerUser, seedLot, seedAuction } from '../helpers/seed';

const USER_PORT = 3001;
const AUCTION_PORT = 3003;
const PAYMENT_PORT = 3004;
const SHIPPING_PORT = 3006;

// Must match STRIPE_WEBHOOK_SECRET in docker-compose.test.yml (default: whsec_test)
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

/** Constructs a Stripe-compatible webhook signature header. */
function buildStripeWebhookHeader(rawBody: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${ts}.${rawBody}`, 'utf8')
    .digest('hex');
  return `t=${ts},v1=${sig}`;
}

describe('Flow 2 — Full auction lifecycle', () => {
  let adminToken: string;
  let buyerUserId: string;
  let buyerToken: string;
  let lotId: string;

  beforeAll(async () => {
    // Wait for all relevant services
    await Promise.all([
      waitForHttp(`http://localhost:${USER_PORT}/health`),
      waitForHttp(`http://localhost:${AUCTION_PORT}/health`),
      waitForHttp(`http://localhost:${PAYMENT_PORT}/health`),
      waitForHttp(`http://localhost:${SHIPPING_PORT}/health`),
    ]);

    await Promise.all([
      resetDb('user'),
      resetDb('catalogue'),
      resetDb('auction'),
      resetDb('payment'),
      resetDb('shipping'),
    ]);
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('creates an approved buyer and an admin', async () => {
    // Seed admin
    const admin = await seedAdminUser();
    adminToken = admin.accessToken;

    // Seed buyer — starts as REGISTERED; promote to APPROVED_BIDDER directly in DB
    const buyer = await seedBuyerUser();
    buyerUserId = buyer.userId;

    const db = getDb('user');
    await db.query(
      "UPDATE users SET status = 'APPROVED_BIDDER' WHERE id = $1",
      [buyerUserId],
    );

    // Login with updated status so JWT carries verificationStatus = APPROVED_BIDDER
    const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
      '/api/users/login',
      { email: buyer.email, password: buyer.password },
    );
    expect(loginRes.status).toBe(200);
    buyerToken = loginRes.body.data.accessToken;
  });

  it('admin creates a lot and schedules a short auction', async () => {
    const lot = await seedLot(adminToken);
    lotId = lot.lotId;

    // 20-second auction, no reserve (so any bid wins)
    await seedAuction(lotId, adminToken, { reservePrice: 0, durationSeconds: 20 });
  });

  it('buyer places a winning bid once the auction goes LIVE', async () => {
    // Wait for auction to become LIVE
    await waitFor(async () => {
      const r = await api(AUCTION_PORT).get<{ data: { status: string } }>(
        `/api/auctions/${lotId}`,
      );
      return r.body?.data?.status === 'LIVE';
    }, 30_000);

    const bidRes = await api(AUCTION_PORT).post<{ data: { bidId: string } }>(
      `/api/auctions/${lotId}/bids`,
      { amount: 500 },
      buyerToken,
    );
    expect(bidRes.status).toBe(201);
  });

  it('auction closes as SOLD and payment service creates an invoice', async () => {
    // Wait for auction to reach SOLD status
    await waitFor(async () => {
      const r = await api(AUCTION_PORT).get<{ data: { status: string } }>(
        `/api/auctions/${lotId}`,
      );
      return r.body?.data?.status === 'SOLD';
    }, 60_000);

    // Poll payment DB until invoice appears
    const paymentDb = getDb('payment');
    await waitFor(async () => {
      const r = await paymentDb.query<{ id: string }>(
        'SELECT id FROM invoices WHERE lot_id = $1',
        [lotId],
      );
      return r.rows.length > 0;
    }, 30_000);

    const { rows } = await paymentDb.query<{
      id: string;
      winner_user_id: string;
      status: string;
      amount: string;
    }>(
      'SELECT id, winner_user_id, status, amount FROM invoices WHERE lot_id = $1',
      [lotId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].winner_user_id).toBe(buyerUserId);
    expect(rows[0].status).toBe('AWAITING_PAYMENT');
    expect(Number(rows[0].amount)).toBe(500);
  });

  it('simulated Stripe webhook marks the invoice as PAID', async () => {
    const paymentDb = getDb('payment');
    const { rows } = await paymentDb.query<{ id: string }>(
      'SELECT id FROM invoices WHERE lot_id = $1',
      [lotId],
    );
    const invoiceId = rows[0].id;

    // Build a realistic checkout.session.completed event payload
    const stripeEvent = {
      id: `evt_test_${Date.now()}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          metadata: { invoiceId },
          payment_intent: `pi_test_${Date.now()}`,
        },
      },
    };
    const rawBody = JSON.stringify(stripeEvent);
    const stripeSignature = buildStripeWebhookHeader(rawBody);

    // POST the fake webhook directly to the payment service
    const res = await fetch(`http://localhost:${PAYMENT_PORT}/api/payments/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': stripeSignature,
      },
      body: rawBody,
    });
    expect(res.status).toBe(200);

    // Wait for invoice to be marked PAID
    await waitFor(async () => {
      const r = await paymentDb.query<{ status: string }>(
        'SELECT status FROM invoices WHERE id = $1',
        [invoiceId],
      );
      return r.rows[0]?.status === 'PAID';
    }, 15_000);
  });

  it('shipping service creates a fulfilment after payment', async () => {
    const shippingDb = getDb('shipping');

    await waitFor(async () => {
      const r = await shippingDb.query<{ id: string }>(
        'SELECT id FROM fulfilments WHERE lot_id = $1',
        [lotId],
      );
      return r.rows.length > 0;
    }, 30_000);

    const { rows } = await shippingDb.query<{
      id: string;
      user_id: string;
      method: string | null;
      status: string;
    }>(
      'SELECT id, user_id, method, status FROM fulfilments WHERE lot_id = $1',
      [lotId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(buyerUserId);
    expect(rows[0].method).toBeNull(); // not yet chosen
    expect(rows[0].status).toBe('PENDING_CHOICE');
  });

  it('buyer chooses shipping method', async () => {
    const shippingDb = getDb('shipping');
    const { rows } = await shippingDb.query<{ id: string }>(
      'SELECT id FROM fulfilments WHERE lot_id = $1',
      [lotId],
    );
    const fulfilmentId = rows[0].id;

    const chooseRes = await api(SHIPPING_PORT).post<{ data: { success: boolean } }>(
      `/api/shipping/fulfilments/${fulfilmentId}/choose-ship`,
      {
        fullName: 'Test Buyer',
        line1: '1 High Street',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'GB',
      },
      buyerToken,
    );
    expect(chooseRes.status).toBe(200);

    // Assert method and status updated in DB
    const { rows: updated } = await shippingDb.query<{ method: string; status: string }>(
      'SELECT method, status FROM fulfilments WHERE id = $1',
      [fulfilmentId],
    );
    expect(updated[0].method).toBe('SHIP');
    expect(updated[0].status).toBe('PENDING_DISPATCH');
  });
});
