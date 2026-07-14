import { HumanVerifier } from '../../application/human-verifier';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 3000;

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

export class TurnstileVerifier implements HumanVerifier {
  constructor(private readonly secretKey: string) {}

  async verify(token: string, remoteIp?: string): Promise<boolean> {
    const body = new URLSearchParams({ secret: this.secretKey, response: token });
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      const result = (await res.json()) as SiteverifyResponse;
      return result.success;
    } catch (err: unknown) {
      // Fail open by design: a Cloudflare outage must not block sign-ups or logins.
      const reason = err instanceof Error ? err.message : 'unknown error';
      console.error(`Turnstile verification unavailable, allowing request: ${reason}`);
      return true;
    }
  }
}
