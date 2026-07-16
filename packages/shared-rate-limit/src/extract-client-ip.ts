import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

// Loose shape check only — Nginx sets the header, this guards against garbage,
// not against spoofing (an attacker-controlled XFF just picks their own bucket).
const IP_SHAPE = /^[0-9a-fA-F.:]+$/;

export function extractClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const leftmost = forwarded.split(',')[0]?.trim();
    if (leftmost && IP_SHAPE.test(leftmost)) {
      return leftmost;
    }
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // No Node socket behind this context (e.g. app.request() in tests).
    return 'unknown';
  }
}
