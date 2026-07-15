import { Client } from 'pg';
import { SERVICE_URLS, SEED_DB_URL, uniqueSuffix } from './env';

// LotSeed/AuctionSeed field names verified against the real routers (Task 5,
// Step 2): apps/catalogue/src/main.ts (`POST /api/lots`) and
// apps/auction-engine/src/presentation/auction-router.ts (`POST
// /api/auctions`). Neither carries `startingPrice`/`startsAt`/`endsAt` as the
// original skeleton assumed — see task-5-report.md for the full diff.
export interface LotSeed {
  title: string;
  description?: string;
  categoryId?: string;
  condition?: string;
  estimatedValue?: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface AuctionSeed {
  startAt: string;
  endAt: string;
  reservePrice?: number;
  minBidIncrement?: number;
  autoExtendWindowMinutes?: number;
  autoExtendDurationMinutes?: number;
}

async function postJson(url: string, body: unknown, token?: string): Promise<Response> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${url} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

/**
 * Registers a user through the real `/register` endpoint, reads the
 * email-verification code out of the `verification_tokens` table (the
 * user-auth service never returns it over HTTP, in any NODE_ENV — see
 * task-5-report.md), verifies the email, optionally promotes to ADMIN via
 * direct SQL (there is no admin-promotion API), then logs in.
 */
export async function registerAndVerifyUser(
  opts?: { role?: 'BIDDER' | 'ADMIN' },
): Promise<{ userId: string; email: string; password: string; accessToken: string; refreshCookie: string }> {
  const suffix = uniqueSuffix();
  const email = `e2e-${suffix}@carat-test.internal`;
  const password = 'Passw0rd!e2e';

  // POST /api/users/register only requires { email, password } (+ optional
  // `country`); its 201 response body is { data: { message } } — no userId
  // is returned, so it must be looked up by email afterwards. Note the real
  // mount path is `/api/users/*` (apps/user-auth/src/main.ts:
  // `app.route('/api/users', buildUserRouter(...))`), not root as the
  // original skeleton assumed.
  await postJson(`${SERVICE_URLS.userAuth}/api/users/register`, { email, password });

  const userId = await findUserIdByEmail(email);

  const emailCode = await retrieveVerificationCode(userId, 'EMAIL');
  // POST /api/users/verify-email expects { userId, code } — not { token }.
  await postJson(`${SERVICE_URLS.userAuth}/api/users/verify-email`, { userId, code: emailCode });

  if (opts?.role === 'ADMIN') {
    await promoteToAdmin(userId);
  }

  const loginRes = await postJson(`${SERVICE_URLS.userAuth}/api/users/login`, { email, password });
  const refreshCookie = loginRes.headers.get('set-cookie') ?? '';
  const loginBody = (await loginRes.json()) as { data: { accessToken: string } };
  const accessToken = loginBody.data.accessToken;

  return { userId, email, password, accessToken, refreshCookie };
}

/**
 * Drives the phone-OTP flow via the real endpoints. The `userId` needed to
 * look up the OTP in the DB is decoded from the JWT (the OTP itself is never
 * returned over HTTP — see task-5-report.md), not passed as a parameter,
 * matching the produced-interface signature `verifyPhone(accessToken)`.
 */
export async function verifyPhone(accessToken: string, phone = '+447700900000'): Promise<void> {
  const userId = decodeUserIdFromJwt(accessToken);
  // POST /api/users/phone/request expects { phone }; userId comes from the
  // JWT server-side (route is behind authMiddleware — see main.ts:
  // `app.use('/api/users/phone/*', authMiddleware(jwtPublicKey))`).
  await postJson(`${SERVICE_URLS.userAuth}/api/users/phone/request`, { phone }, accessToken);
  const otp = await retrieveVerificationCode(userId, 'PHONE');
  // POST /api/users/phone/verify expects { code }.
  await postJson(`${SERVICE_URLS.userAuth}/api/users/phone/verify`, { code: otp }, accessToken);
}

export async function seedLot(
  adminToken: string,
  overrides: Partial<LotSeed> = {},
): Promise<{ lotId: string }> {
  const suffix = uniqueSuffix();
  const res = await postJson(
    `${SERVICE_URLS.catalogue}/api/lots`,
    { title: `E2E Lot ${suffix}`, ...overrides },
    adminToken,
  );
  const body = (await res.json()) as { data: { id: string } };
  return { lotId: body.data.id };
}

export async function seedAuction(
  adminToken: string,
  lotId: string,
  overrides: Partial<AuctionSeed> = {},
): Promise<{ auctionId: string }> {
  const now = Date.now();
  const defaults: AuctionSeed = {
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 60 * 60 * 1000).toISOString(),
  };
  const res = await postJson(
    `${SERVICE_URLS.auction}/api/auctions`,
    { lotId, ...defaults, ...overrides },
    adminToken,
  );
  // POST /api/auctions responds { data: { lotId } } — auction-engine is
  // event-sourced per-lot and has no separate auction id; lotId is the only
  // identifier the endpoint returns, so it doubles as auctionId here.
  const body = (await res.json()) as { data: { lotId: string } };
  return { auctionId: body.data.lotId };
}

async function promoteToAdmin(userId: string): Promise<void> {
  const client = new Client({ connectionString: SEED_DB_URL });
  await client.connect();
  try {
    await client.query('UPDATE users SET role = $1 WHERE id = $2', ['ADMIN', userId]);
  } finally {
    await client.end();
  }
}

async function findUserIdByEmail(email: string): Promise<string> {
  const client = new Client({ connectionString: SEED_DB_URL });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      throw new Error(`Seed: no user found for email ${email} after /register`);
    }
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}

/**
 * Reads the most recently issued verification code for a user out of
 * `verification_tokens` (columns: user_id, type, code, expires_at — see
 * apps/user-auth/migrations/001_create_users.sql). Neither the
 * email-verification code nor the phone OTP is ever surfaced over HTTP by
 * user-auth (grepped for NODE_ENV branches in apps/user-auth/src — there are
 * none), so this direct-DB read is the only way to drive these flows without
 * a service code change.
 */
async function retrieveVerificationCode(userId: string, type: 'EMAIL' | 'PHONE'): Promise<string> {
  const client = new Client({ connectionString: SEED_DB_URL });
  await client.connect();
  try {
    const result = await client.query<{ code: string }>(
      `SELECT code FROM verification_tokens
       WHERE user_id = $1 AND type = $2
       ORDER BY expires_at DESC
       LIMIT 1`,
      [userId, type],
    );
    if (result.rows.length === 0) {
      throw new Error(`Seed: no ${type} verification token found for user ${userId}`);
    }
    return result.rows[0].code;
  } finally {
    await client.end();
  }
}

/** Decodes the `userId` claim out of a JWT without verifying its signature — safe here because this is a test-seeding helper reading a token this same process just issued via /login. */
function decodeUserIdFromJwt(accessToken: string): string {
  const [, payloadSegment] = accessToken.split('.');
  if (!payloadSegment) {
    throw new Error('Seed: accessToken is not a valid JWT');
  }
  const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
  const payload = JSON.parse(json) as { userId?: string };
  if (!payload.userId) {
    throw new Error('Seed: JWT payload has no userId claim');
  }
  return payload.userId;
}
