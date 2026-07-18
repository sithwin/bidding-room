import { createServer, IncomingMessage, Server } from 'node:http';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

export interface MockGoogleServer {
  port: number;
  issueIdTokenFor(email: string, emailVerified: boolean): void;
  close(): Promise<void>;
}

const CLIENT_ID = 'test-google-client-id';
const ISSUER = 'https://accounts.google.com';

// Fixed, not ephemeral (unlike the brief's original `listen(0, ...)` sketch): docker-compose.test.yml's
// `user-auth` service reads GOOGLE_TOKEN_ENDPOINT_OVERRIDE/GOOGLE_JWKS_URL_OVERRIDE once, at container
// start, from `docker compose -f docker-compose.test.yml up -d --build` — a separate command/CI step
// that runs *before* `pnpm --filter @carat-room/e2e test:e2e` (see tests/e2e/README.md's "Two-command
// local run" and .github/workflows/ci.yml's separate steps). global-setup.ts (which starts this server)
// only runs inside the second command, so an ephemeral port discovered there can never reach the compose
// file's env substitution in time. A fixed, well-known port lets docker-compose.test.yml hardcode the
// same value statically, while still only needing the mock server to be *listening* by the time the
// spec drives the OAuth flow (which it is, since global-setup always runs before any spec).
export const MOCK_GOOGLE_SERVER_PORT = 9099;

export async function startMockGoogleServer(port: number = MOCK_GOOGLE_SERVER_PORT): Promise<MockGoogleServer> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  let nextEmail = 'e2e-google-user@carat-test.internal';
  let nextEmailVerified = true;

  const server: Server = createServer(async (req, res) => {
    // Control channel: global-setup.ts starts this server in the Playwright *runner* process, but
    // spec files run in a separate (forked) worker process, so they cannot call issueIdTokenFor()
    // directly on the object returned below — they reach it over HTTP instead, exactly like the
    // real token/jwks endpoints, before triggering the browser's OAuth flow. Without this, every run
    // would get the same hard-coded default email regardless of the test's own unique-suffixed email.
    if (req.url === '/control/next-id-token' && req.method === 'POST') {
      const body = (await readJsonBody(req)) as { email?: string; emailVerified?: boolean };
      if (typeof body.email === 'string') {
        nextEmail = body.email;
        nextEmailVerified = body.emailVerified ?? true;
      }
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === '/token' && req.method === 'POST') {
      const idToken = await new SignJWT({ email: nextEmail, email_verified: nextEmailVerified })
        .setProtectedHeader({ alg: 'RS256', kid: 'e2e-key' })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setSubject(`google-sub-${nextEmail}`)
        .setExpirationTime('5m')
        .sign(privateKey);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id_token: idToken }));
      return;
    }
    if (req.url === '/jwks' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: 'e2e-key', alg: 'RS256', use: 'sig' }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: boundPort,
    issueIdTokenFor(email: string, emailVerified: boolean) {
      nextEmail = email;
      nextEmailVerified = emailVerified;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
