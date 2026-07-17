/**
 * Reads a rate-limit `max` from an env var, falling back to `defaultValue`
 * when unset, non-numeric, or non-positive. Every service's production
 * ceiling is chosen for a single real end user; the Playwright E2E suite
 * runs from one shared container IP and legitimately generates far more
 * traffic than that per minute, so docker-compose.test.yml overrides these
 * vars to raise the ceiling for E2E without touching production behaviour
 * (docker-compose.yml leaves them unset).
 */
export function maxRequestsFromEnv(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
