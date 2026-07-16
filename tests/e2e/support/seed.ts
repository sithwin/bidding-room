import { createHmac } from 'node:crypto';
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
 * Looks up the (unconsumed) email-verification code for a user who was
 * registered directly through the real UI (login-client.tsx's register tab)
 * rather than via `registerAndVerifyUser` — used by specs that need to drive
 * the real `/account/verify-email?token=&userId=` link in the browser, the
 * same way the email the user receives would. Same DB read as
 * `registerAndVerifyUser`'s internal verification step (see its doc comment
 * for why this can only be read from `verification_tokens`, never over
 * HTTP), just exposed for callers that only have an email, not a userId.
 */
export async function retrieveEmailVerificationLink(
  email: string,
): Promise<{ userId: string; code: string }> {
  const userId = await findUserIdByEmail(email);
  const code = await retrieveVerificationCode(userId, 'EMAIL');
  return { userId, code };
}

/**
 * Looks up the (unconsumed) phone-OTP code for a user who has already had
 * `/api/users/phone/request` triggered for them (either via `verifyPhone`
 * below, or — as the register-to-bid spec does — via the real
 * verify-phone/PhoneOtpInline UI's "Send Code" button). Same DB read as
 * `verifyPhone`'s internal step, exposed for callers driving the OTP entry
 * step through the real UI rather than the API, mirroring
 * `retrieveEmailVerificationLink` above.
 */
export async function retrievePhoneOtp(userId: string): Promise<string> {
  return retrieveVerificationCode(userId, 'PHONE');
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

/**
 * Promotes an already phone-verified user straight to `APPROVED_BIDDER` via
 * the real admin endpoint `PATCH /api/users/:id/approve`
 * (apps/user-auth/src/presentation/admin-users-router.ts) — the domain's
 * `approve()` (apps/user-auth/src/domain/user.ts) accepts any status other
 * than `SUSPENDED`/`APPROVED_BIDDER`, so this legitimately skips the
 * identity-document/PENDING_REVIEW step without any DB hack, matching how an
 * admin would fast-track a trusted bidder. Task 8 (browse-and-bid spec):
 * the auction-engine bid endpoint
 * (apps/auction-engine/src/presentation/auction-router.ts:156) requires
 * `verificationStatus === 'APPROVED_BIDDER'` in the JWT, so this is needed
 * before any bid can be placed — see task-8-report.md for why bidding is
 * still blocked even after this step (no working Stripe test credentials in
 * this environment for the card-on-file check in `lot-detail-client.tsx`).
 */
export async function approveBidder(adminToken: string, userId: string): Promise<void> {
  const res = await fetch(`${SERVICE_URLS.userAuth}/api/users/${userId}/approve`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) {
    throw new Error(`PATCH /api/users/${userId}/approve failed: ${res.status} ${await res.text()}`);
  }
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

/**
 * Waits for a lot's auction to close (via its own BullMQ `close-auction`
 * timer job — auction-engine has no public "close now" trigger, confirmed by
 * reading apps/auction-engine/src/presentation/auction-router.ts in full) and
 * for the `payment` service to react to the resulting `auction.closed` event
 * by issuing an invoice (apps/payment/src/infrastructure/auction-closed-consumer.ts,
 * which only fires when `reserveMet && winnerUserId && highestAmount != null`
 * — see apps/auction-engine/src/domain/auction-aggregate.ts's `close()`,
 * where `reserveMet` is `highestBidAmount >= reservePrice`, so callers must
 * seed the auction with a `reservePrice` the winning bid actually clears,
 * e.g. the default `0`).
 *
 * Callers are responsible for scheduling the auction with a short `endAt`
 * (via `seedAuction`'s `overrides`) and placing the winning bid *before* that
 * `endAt`, through a direct call to auction-engine's real
 * `POST /api/auctions/:lotId/bids` (which only requires `APPROVED_BIDDER`,
 * not a Stripe-verified card — that gate lives solely in the portal's
 * `lot-detail-client.tsx`, confirmed by reading the router directly). This
 * helper only *waits*; it polls the admin-only `GET /api/payments/invoices`
 * list endpoint (apps/payment/src/presentation/payment-router.ts — there is
 * no "get invoice by lotId" endpoint) until an invoice for `lotId` and
 * `winnerUserId` appears.
 */
export async function closeAuctionAndAwaitInvoice(
  adminToken: string,
  lotId: string,
  winnerUserId: string,
  timeoutMs = 30_000,
): Promise<{ invoiceId: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${SERVICE_URLS.payment}/api/payments/invoices`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      throw new Error(`GET /api/payments/invoices failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: Array<{ id: string; lotId: string; winnerUserId: string }> };
    const match = body.data.find((inv) => inv.lotId === lotId && inv.winnerUserId === winnerUserId);
    if (match) {
      return { invoiceId: match.id };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Seed: no invoice appeared for lot ${lotId} / winner ${winnerUserId} within ${timeoutMs}ms — ` +
      'the auction may not have closed yet, reserve may not have been met, or the winning bid was never placed',
  );
}

/**
 * Places a bid directly against auction-engine's real bid API
 * (`POST /api/auctions/:lotId/bids`), bypassing the portal UI entirely. This
 * is the only real way to seed a winning bid in this environment: the
 * portal's `lot-detail-client.tsx` hard-gates bidding on a Stripe-verified
 * card, and this test environment has no working Stripe test credentials
 * (see browse-and-bid.spec.ts's header comment / task-8-report.md). The
 * auction-engine endpoint itself has no such gate — it only requires
 * `verificationStatus === 'APPROVED_BIDDER'` (auction-router.ts:186), which
 * `approveBidder` above already provides via a real API.
 */
export async function placeBidDirect(
  bidderToken: string,
  lotId: string,
  amount: number,
): Promise<void> {
  const url = `${SERVICE_URLS.auction}/api/auctions/${lotId}/bids`;
  // A freshly `seedAuction`-scheduled lot's `start-auction` BullMQ job (delay
  // 0, but still processed asynchronously by the worker) may not have
  // transitioned the lot from SCHEDULED to LIVE yet when the caller races to
  // place a bid immediately after scheduling — the bid endpoint legitimately
  // 409s (`AUCTION_NOT_ACTIVE`) until it has. Retry briefly rather than
  // widening the auction's `startAt`/`endAt` window, which would just move
  // the race instead of removing it.
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bidderToken}` },
      body: JSON.stringify({ amount }),
    });
    if (res.ok) {
      return;
    }
    const text = await res.text();
    const isRetryable = res.status === 409 && text.includes('AUCTION_NOT_ACTIVE');
    if (!isRetryable || attempt === maxAttempts) {
      throw new Error(`POST ${url} failed: ${res.status} ${text}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// Well-known shared HMAC secret this environment's payment container is
// actually booted with (docker-compose.test.yml: `STRIPE_WEBHOOK_SECRET:
// ${STRIPE_WEBHOOK_SECRET:-whsec_test}`) — a fixture value, not a real
// secret. `apps/payment/src/main.ts:35` reads it straight from
// `process.env['STRIPE_WEBHOOK_SECRET']!` with no fallback, so this constant
// must track the compose file's default whenever the shell doesn't override
// it, matching how SEED_DB_URL/SERVICE_URLS already mirror the compose file
// in `env.ts`.
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';

/**
 * Builds the identical `stripe-signature` header the real Stripe SDK would
 * produce (`t=<unix-seconds>,v1=<hex hmac-sha256 of "<timestamp>.<payload>">`)
 * per Stripe's documented webhook-signing scheme, which is exactly what
 * `apps/payment/src/infrastructure/stripe-adapter.ts`'s `constructWebhookEvent`
 * verifies via the real `stripe` SDK's `webhooks.constructEvent`.
 */
function buildStripeSignatureHeader(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Simulates the real Stripe `checkout.session.completed` webhook that
 * `payment`'s `HandleWebhookUseCase`
 * (apps/payment/src/application/handle-webhook-use-case.ts) consumes to mark
 * an invoice paid and publish `payment.received` (which `shipping`'s
 * `PaymentReceivedHandler`, apps/shipping/src/infrastructure/events/payment-received-handler.ts,
 * consumes to create the fulfilment record). This environment's
 * `STRIPE_SECRET_KEY` is a non-functional placeholder (see
 * invoice-checkout.spec.ts's header comment / task-9-report.md), so a real
 * Stripe Checkout session can never be completed through the UI here — but
 * `constructWebhookEvent` only verifies the caller knows
 * `STRIPE_WEBHOOK_SECRET` (the HMAC secret Stripe itself signs webhook
 * deliveries with), which this test environment fixes to a known value (see
 * `STRIPE_WEBHOOK_SECRET` above). POSTing a correctly-signed event to the
 * real `POST /api/payments/webhooks/stripe` endpoint is the same "drive the
 * real API, skip the environment gap that blocks the browser/real-Stripe leg"
 * pattern `placeBidDirect` already uses for the Stripe-card bidding gate — it
 * is not a database shortcut, and it does not fabricate a fulfilment record
 * directly: the fulfilment is still created by the real `payment.received`
 * consumer, exactly as it would be after a genuine Stripe payment.
 */
async function simulatePaymentReceivedWebhook(invoiceId: string): Promise<void> {
  const payload = JSON.stringify({
    id: `evt_e2e_${uniqueSuffix()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        metadata: { invoiceId },
        payment_intent: `pi_e2e_${uniqueSuffix()}`,
      },
    },
  });
  const signature = buildStripeSignatureHeader(STRIPE_WEBHOOK_SECRET, payload);
  const res = await fetch(`${SERVICE_URLS.payment}/api/payments/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  if (!res.ok) {
    throw new Error(`POST /api/payments/webhooks/stripe failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Polls the admin-only `GET /api/shipping/fulfilments` list endpoint
 * (apps/shipping/src/presentation/shipping-router.ts — there is no "get
 * fulfilment by lotId" endpoint, mirroring `closeAuctionAndAwaitInvoice`'s
 * identical constraint on the payment service's invoice list) until a
 * fulfilment for `lotId`/`userId` appears — i.e. until `shipping`'s
 * `payment.received` consumer has actually run.
 */
async function awaitFulfilmentForLotAndUser(
  adminToken: string,
  lotId: string,
  userId: string,
  timeoutMs = 30_000,
): Promise<{ fulfilmentId: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${SERVICE_URLS.shipping}/api/shipping/fulfilments`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      throw new Error(`GET /api/shipping/fulfilments failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data: Array<{ id: string; lotId: string; userId: string }> };
    const match = body.data.find((f) => f.lotId === lotId && f.userId === userId);
    if (match) {
      return { fulfilmentId: match.id };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Seed: no fulfilment appeared for lot ${lotId} / user ${userId} within ${timeoutMs}ms — ` +
      'the payment.received event may not have been consumed yet',
  );
}

/**
 * Drives a user all the way from a fresh, phone-verified registration to
 * owning a real `PENDING_CHOICE` fulfilment record, following the actual
 * chain this domain uses: admin lists a lot -> admin schedules a short
 * auction -> the (approved) caller wins it with a direct bid
 * (`placeBidDirect`, same Stripe-card-gate workaround as
 * invoice-checkout.spec.ts) -> the auction's real close timer fires ->
 * `payment`'s `auction-closed-consumer` issues an invoice
 * (`closeAuctionAndAwaitInvoice`) -> a simulated-but-correctly-signed Stripe
 * webhook marks it paid (`simulatePaymentReceivedWebhook`) -> `shipping`'s
 * real `payment.received` consumer creates the fulfilment
 * (`awaitFulfilmentForLotAndUser`). Every step drives a real endpoint; only
 * the final "customer completes Stripe Checkout in a real browser" leg is
 * swapped for a signed webhook call, for the same non-functional-Stripe-key
 * reason `placeBidDirect` bypasses the UI bid button.
 */
export async function seedFulfilmentForUser(
  user: Awaited<ReturnType<typeof registerAndVerifyUser>>,
): Promise<{ fulfilmentId: string }> {
  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken, { estimatedValue: 500 });

  await approveBidder(admin.accessToken, user.userId);
  // approveBidder mutates verificationStatus server-side but `user.accessToken`
  // was minted before that change; the bid endpoint reads verificationStatus
  // straight from the JWT (auction-router.ts:186), so a fresh login is
  // required before bidding — same gotcha invoice-checkout.spec.ts documents.
  const loginRes = await postJson(`${SERVICE_URLS.userAuth}/api/users/login`, {
    email: user.email,
    password: user.password,
  });
  const loginBody = (await loginRes.json()) as { data: { accessToken: string } };
  const bidderToken = loginBody.data.accessToken;

  // Short endAt + auto-extend disabled: same anti-sniping-neutralisation
  // pattern as invoice-checkout.spec.ts's header comment explains in full.
  const now = Date.now();
  await seedAuction(admin.accessToken, lotId, {
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 8_000).toISOString(),
    autoExtendWindowMinutes: 0,
    autoExtendDurationMinutes: 0,
  });

  await placeBidDirect(bidderToken, lotId, 1_000);

  const { invoiceId } = await closeAuctionAndAwaitInvoice(admin.accessToken, lotId, user.userId);

  await simulatePaymentReceivedWebhook(invoiceId);

  return awaitFulfilmentForLotAndUser(admin.accessToken, lotId, user.userId);
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
