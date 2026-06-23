import { randomUUID } from 'node:crypto';
import { api } from './api';
import { getDb } from './db';

const PORTS = {
  user: 3001,
  catalogue: 3002,
  auction: 3003,
} as const;

// bcrypt hash of 'Test1234!' with salt rounds = 10 (pre-computed)
const ADMIN_PASSWORD_HASH = '$2b$10$7C1.dhAo219ztkBeemu6VuTp2Wu2NCyXxacT.nV8TedVyBMHww4c.';
// bcrypt hash of 'BuyerPass1!' with salt rounds = 10 (pre-computed)
const BUYER_PASSWORD_HASH = '$2b$10$7DbwEZcTLIS/AXLCoexH.es0.iVBRVahRuZpMZ4FbiJ5Y/DzwrxGy';

/**
 * Inserts an admin user directly into the user DB, bypassing registration.
 * Returns a valid admin JWT obtained from the login endpoint.
 */
export async function seedAdminUser(): Promise<{
  userId: string;
  accessToken: string;
}> {
  const userId = randomUUID();
  const email = `admin-${userId.slice(0, 8)}@test.carat-room.internal`;
  const password = 'Test1234!';

  const db = getDb('user');
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'ADMIN', 'APPROVED_BIDDER', NOW(), NOW())`,
    [userId, email, ADMIN_PASSWORD_HASH],
  );

  const { status, body } = await api(PORTS.user).post<{
    data: { accessToken: string };
  }>('/api/users/login', { email, password });

  if (status !== 200) {
    throw new Error(`Admin login failed (${status}): ${JSON.stringify(body)}`);
  }

  return { userId, accessToken: (body as any).data.accessToken };
}

/**
 * Inserts an unverified buyer into the user DB.
 * The test flow is responsible for completing email + phone verification.
 */
export async function seedBuyerUser(): Promise<{
  userId: string;
  email: string;
  password: string;
}> {
  const userId = randomUUID();
  const email = `buyer-${userId.slice(0, 8)}@test.carat-room.internal`;
  const password = 'BuyerPass1!';

  const db = getDb('user');
  await db.query(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'BUYER', 'REGISTERED', NOW(), NOW())`,
    [userId, email, BUYER_PASSWORD_HASH],
  );

  return { userId, email, password };
}

/**
 * Creates a lot via the Catalogue Service API using the given admin JWT.
 * Returns the lotId for use in auction seeding.
 */
export async function seedLot(
  adminToken: string,
): Promise<{ lotId: string }> {
  const { status, body } = await api(PORTS.catalogue).post<{
    data: { id: string };
  }>(
    '/api/lots',
    {
      title: `Test Diamond Ring ${randomUUID().slice(0, 8)}`,
      description: 'A fine test lot for integration testing.',
      estimatedValue: 1000,
    },
    adminToken,
  );

  if (status !== 201) {
    throw new Error(`seedLot failed (${status}): ${JSON.stringify(body)}`);
  }

  return { lotId: (body as any).data.id as string };
}

/**
 * Schedules an auction for the given lotId via the Auction Engine API.
 * durationSeconds defaults to 30 so tests complete in reasonable time.
 * reservePrice defaults to 0 (no effective reserve) for most flows.
 */
export async function seedAuction(
  lotId: string,
  adminToken: string,
  opts: { reservePrice?: number; durationSeconds?: number } = {},
): Promise<{ lotId: string }> {
  const { reservePrice = 0, durationSeconds = 30 } = opts;

  const startAt = new Date(Date.now() + 2_000);
  const endAt = new Date(startAt.getTime() + durationSeconds * 1_000);

  const { status, body } = await api(PORTS.auction).post<{
    data: { lotId: string };
  }>(
    '/api/auctions',
    {
      lotId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      reservePrice,
      minBidIncrement: 1,
      autoExtendWindowMinutes: 1,
      autoExtendDurationMinutes: 1,
    },
    adminToken,
  );

  if (status !== 201) {
    throw new Error(`seedAuction failed (${status}): ${JSON.stringify(body)}`);
  }

  return { lotId };
}
