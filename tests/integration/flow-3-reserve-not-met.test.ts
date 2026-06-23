import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';
import { seedAdminUser, seedBuyerUser, seedLot, seedAuction } from '../helpers/seed';

const USER_PORT = 3001;
const AUCTION_PORT = 3003;
const PAYMENT_PORT = 3004;

describe('Flow 3 — Reserve not met', () => {
  let adminToken: string;
  let buyerToken: string;
  let lotId: string;

  beforeAll(async () => {
    await Promise.all([
      waitForHttp(`http://localhost:${USER_PORT}/health`),
      waitForHttp(`http://localhost:${AUCTION_PORT}/health`),
      waitForHttp(`http://localhost:${PAYMENT_PORT}/health`),
    ]);

    await Promise.all([
      resetDb('user'),
      resetDb('catalogue'),
      resetDb('auction'),
      resetDb('payment'),
    ]);
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('creates an admin and an approved buyer', async () => {
    const admin = await seedAdminUser();
    adminToken = admin.accessToken;

    const buyer = await seedBuyerUser();
    const db = getDb('user');
    await db.query(
      "UPDATE users SET status = 'APPROVED_BIDDER' WHERE id = $1",
      [buyer.userId],
    );

    const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
      '/api/users/login',
      { email: buyer.email, password: buyer.password },
    );
    expect(loginRes.status).toBe(200);
    buyerToken = loginRes.body.data.accessToken;
  });

  it('admin creates a lot with a high reserve and schedules a short auction', async () => {
    const lot = await seedLot(adminToken);
    lotId = lot.lotId;

    // Reserve is 10 000; buyer will bid only 100 → reserve not met
    await seedAuction(lotId, adminToken, { reservePrice: 10_000, durationSeconds: 20 });
  });

  it('buyer places a bid below the reserve', async () => {
    await waitFor(async () => {
      const r = await api(AUCTION_PORT).get<{ data: { status: string } }>(
        `/api/auctions/${lotId}`,
      );
      return r.body?.data?.status === 'LIVE';
    }, 30_000);

    const bidRes = await api(AUCTION_PORT).post<{ data: { bidId: string } }>(
      `/api/auctions/${lotId}/bids`,
      { amount: 100 },
      buyerToken,
    );
    expect(bidRes.status).toBe(201);
  });

  it('auction closes as UNSOLD and no invoice is created', async () => {
    // Wait for auction to reach UNSOLD status
    await waitFor(async () => {
      const r = await api(AUCTION_PORT).get<{ data: { status: string } }>(
        `/api/auctions/${lotId}`,
      );
      return r.body?.data?.status === 'UNSOLD';
    }, 60_000);

    // Allow time for any RabbitMQ events to propagate, then assert no invoice
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const paymentDb = getDb('payment');
    const { rows } = await paymentDb.query<{ id: string }>(
      'SELECT id FROM invoices WHERE lot_id = $1',
      [lotId],
    );

    expect(rows).toHaveLength(0);
  });
});
