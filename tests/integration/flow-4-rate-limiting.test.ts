import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { waitForHttp } from '../helpers/wait';
import { resetDb, closeAllPools } from '../helpers/db';
import { api } from '../helpers/api';

const USER_PORT = 3001;
const STRICT_LIMIT = 10;

describe('Flow 4 — Rate limiting', () => {
  beforeAll(async () => {
    await waitForHttp(`http://localhost:${USER_PORT}/health`);
    await resetDb('user');
  });

  afterAll(async () => {
    await closeAllPools();
  });

  it('should_return429_when_loginIsHammeredPastTheStrictLimitFromOneIp', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────────
    const credentials = { email: 'nonexistent@test.carat-room.internal', password: 'wrong-password' };

    // ── Act ──────────────────────────────────────────────────────────────────
    const responses = [];
    for (let attempt = 0; attempt < STRICT_LIMIT + 1; attempt += 1) {
      responses.push(await api(USER_PORT).post('/api/users/login', credentials));
    }

    // ── Assert ───────────────────────────────────────────────────────────────
    const last = responses[responses.length - 1];
    expect(last.status).toBe(429);
  });

  it('should_stillReturn401_when_aDifferentForwardedIpLogsInAfterTheFirstIsThrottled', async () => {
    // ── Arrange ──────────────────────────────────────────────────────────────
    const credentials = { email: 'nonexistent@test.carat-room.internal', password: 'wrong-password' };
    for (let attempt = 0; attempt < STRICT_LIMIT + 1; attempt += 1) {
      await api(USER_PORT).post('/api/users/login', credentials);
    }

    // ── Act ──────────────────────────────────────────────────────────────────
    const res = await fetch(`http://localhost:${USER_PORT}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99',
      },
      body: JSON.stringify(credentials),
    });

    // ── Assert ───────────────────────────────────────────────────────────────
    expect(res.status).toBe(401);
  });
});
