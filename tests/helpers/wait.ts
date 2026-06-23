/**
 * Polls url with GET until it returns HTTP 200 (or timeoutMs elapses).
 * Used before tests run to confirm all services are healthy.
 */
export async function waitForHttp(
  url: string,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // service not yet up — keep polling
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`Timed out waiting for ${url} to become healthy`);
}

/**
 * Polls condition() every 500 ms until it returns true (or timeoutMs elapses).
 * Use this to wait for async side-effects: DB rows, RabbitMQ events, etc.
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitFor condition never became true within timeout');
}
