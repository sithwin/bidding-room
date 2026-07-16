/**
 * Every downstream service rate-limits per client IP (extractClientIp reads
 * `x-forwarded-for`). This portal is itself a server-side proxy in front of
 * those services, so without forwarding the header on, every real admin's
 * request collapses into a single IP bucket — the portal's own. Nginx sets
 * this header for us; pass it straight through unmodified.
 */
export function forwardedForHeader(requestHeaders: Headers): Record<string, string> {
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  return forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {};
}
