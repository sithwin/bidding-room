import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp, waitFor } from '../helpers/wait';
import { resetDb, getDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';

const USER_PORT = 3001;

describe('Flow 1 — Buyer onboarding', () => {
  beforeAll(async () => {
    await waitForHttp(`http://localhost:${USER_PORT}/health`);
    await resetDb('user');
    await resetDb('notification');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('registers a new buyer, verifies email and phone, and reaches APPROVED_BIDDER status', async () => {
    // ── Arrange ────────────────────────────────────────────────────────────────
    const email = `buyer-flow1-${Date.now()}@test.carat-room.internal`;
    const password = 'BuyerPass1!';
    const phone = '+15005550006'; // Twilio test magic number

    // ── Act: register ──────────────────────────────────────────────────────────
    const registerRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/api/users/register',
      { email, password },
    );

    expect(registerRes.status).toBe(201);

    // Registration does not return userId — fetch it from DB
    const db = getDb('user');
    await waitFor(async () => {
      const r = await db.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email],
      );
      return r.rows.length > 0;
    });
    const { rows: userRows } = await db.query<{ id: string; status: string }>(
      'SELECT id, status FROM users WHERE email = $1',
      [email],
    );
    expect(userRows).toHaveLength(1);
    const userId = userRows[0].id;
    expect(userRows[0].status).toBe('REGISTERED');

    // ── Act: verify email ──────────────────────────────────────────────────────
    // Fetch the email verification code directly from DB (no real email in tests)
    await waitFor(async () => {
      const r = await db.query<{ code: string }>(
        "SELECT code FROM verification_tokens WHERE user_id = $1 AND type = 'EMAIL' AND expires_at > NOW()",
        [userId],
      );
      return r.rows.length > 0;
    });

    const tokenRow = await db.query<{ code: string }>(
      "SELECT code FROM verification_tokens WHERE user_id = $1 AND type = 'EMAIL' AND expires_at > NOW() LIMIT 1",
      [userId],
    );
    const emailCode = tokenRow.rows[0].code;

    const verifyEmailRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/api/users/verify-email',
      { userId, code: emailCode },
    );
    expect(verifyEmailRes.status).toBe(200);

    // ── Assert: status updated to EMAIL_VERIFIED ───────────────────────────────
    await waitFor(async () => {
      const r = await db.query<{ status: string }>(
        'SELECT status FROM users WHERE id = $1',
        [userId],
      );
      return r.rows[0]?.status === 'EMAIL_VERIFIED';
    });

    // ── Act: login (email verified) to get access token ───────────────────────
    const loginRes = await api(USER_PORT).post<{ data: { accessToken: string } }>(
      '/api/users/login',
      { email, password },
    );
    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;

    // ── Act: request phone OTP ─────────────────────────────────────────────────
    const otpRequestRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/api/users/phone/request',
      { phone },
      accessToken,
    );
    expect(otpRequestRes.status).toBe(200);

    // ── Assert: phone OTP record created in verification_tokens ───────────────
    await waitFor(async () => {
      const r = await db.query<{ code: string }>(
        "SELECT code FROM verification_tokens WHERE user_id = $1 AND type = 'PHONE' AND expires_at > NOW()",
        [userId],
      );
      return r.rows.length > 0;
    });

    const otpRow = await db.query<{ code: string }>(
      "SELECT code FROM verification_tokens WHERE user_id = $1 AND type = 'PHONE' AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
      [userId],
    );
    const otp = otpRow.rows[0].code;

    // ── Act: verify phone OTP ──────────────────────────────────────────────────
    const verifyPhoneRes = await api(USER_PORT).post<{ data: { message: string } }>(
      '/api/users/phone/verify',
      { code: otp },
      accessToken,
    );
    expect(verifyPhoneRes.status).toBe(200);

    // ── Assert: user is now an APPROVED_BIDDER ────────────────────────────────
    await waitFor(async () => {
      const r = await db.query<{ status: string }>(
        'SELECT status FROM users WHERE id = $1',
        [userId],
      );
      return r.rows[0]?.status === 'APPROVED_BIDDER';
    });

    const { rows: final } = await db.query<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [userId],
    );
    expect(final[0].status).toBe('APPROVED_BIDDER');
  });
});
