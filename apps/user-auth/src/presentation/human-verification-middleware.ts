import { Context, Next } from 'hono';
import { HumanVerifier } from '../application/human-verifier';

export const requireHumanVerification = (verifier: HumanVerifier) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    if (!token) {
      return c.json(
        { error: { code: 'CAPTCHA_REQUIRED', message: 'Human verification is required.' } },
        400,
      );
    }
    const remoteIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');
    const isHuman = await verifier.verify(token, remoteIp);
    if (!isHuman) {
      return c.json(
        { error: { code: 'CAPTCHA_FAILED', message: 'Human verification failed. Please try again.' } },
        400,
      );
    }
    await next();
  };
