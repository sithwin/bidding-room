import { createServer, IncomingMessage, Server } from 'node:http';
import { SignJWT, importPKCS8, importSPKI, exportJWK } from 'jose';

// Fixed test-only RSA key pair (2048-bit, generated once — not a secret, never used outside this
// mock). MUST be fixed rather than generated per-process: apps/user-auth's
// google-identity-provider.ts creates `jose`'s createRemoteJWKSet(...) exactly ONCE, at container
// startup, and caches whatever public key it fetches for the container's entire lifetime — `jose`
// only refetches on an unrecognised `kid`, never on a signature that fails to verify against an
// already-cached, recognised `kid`. With a freshly `generateKeyPair()`-ed key on every
// startMockGoogleServer() call (i.e. every `pnpm test:e2e` run) but the same hardcoded `kid:
// 'e2e-key'` below, only the very FIRST test run against a given long-lived user-auth container
// ever verified successfully — every subsequent run in the same container's lifetime failed
// jwtVerify() with the stale cached key, surfacing as an unlogged 500 INTERNAL_ERROR from
// user-router.ts's /auth/google catch block. A fixed key pair keeps the container's cached JWKS
// valid across every local run, exactly like production Google's own JWKS is stable.
const MOCK_GOOGLE_PRIVATE_KEY_PKCS8 = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCy2KCrSZbQzqZM
+oFT6Oa/Fdw/B0Nv1KXXIUIdRSlDvL2w0OFbX/80mjqYXIIwYa6alSZ3m3uPXyz8
6QiisWUQsIXnWkNuDox+gooNB6T16/XISgogG/JwNWxLT68XeRuZzRQen5hlNias
Trm7IqNeWaFnEFI9du3qnAwRWjA33TV1Qq00mPDnRJpr/X60YpUgmtKhrUMibBzr
q1LQq7hVO4WaAjGg5TLEek7wBU5nJU4gf/aqWtpPig+XeB707kzJBOuBk+PRVeSb
OVWnL4BON53DhinI71mIbEvpl3HImWzFVwml2qcrlTfwp7IWxbr9bjtxw6FE6zBt
4GSyHq/7AgMBAAECggEADzM+JJCykridhblcuIb45ZC0EV9KqfyGw8v91IMGSM2H
yblXDe8Qv6XECSMDpZ0Hu/elN1EtpTfPmQctRraRAmQeXVVcmcP+yNnLZeQabxRI
5Wb1iVkWt9ayh4wUM4iFggLeDOQ/jYqWqtpeCruc6u3vO9U1SCgNfH0awXbK1lR/
6ZwXkSpUAJNp1yiwlg7McqEAC6HdeQrZ6ws+Cdt+gaU61juXPg9MGGb7HTPd3cPk
gbzAB2oyXlO3calxMaeatt+L6CmeVvxw1pP5bWGJbrWcWEkv4GwRmq2os8jhA+w8
nHXTCFN0asbzKAqLwZc8jt5ur+AsHueB3UGs5erskQKBgQD4Z1XToxyZotOnZNN7
6suxS1BMxF/oB41jFPaoZgaX0frUJJ9jCP+FK032+uljnKe/OuduCApqNAliAX3G
cmjZi68RBIjWYAbbiPMUzuMaCNYMkhsw+GvK9szRKk61he1CMm/ur8Mq5H/4T1Xh
ljM4ieJ6Cz0MrpYukahcIrtx5wKBgQC4UMBl37cd3fnkemie7Uh1R0xsGPaIGsNh
mW7ZD9k6v+7E+HIXCwylP1EiW+xv0U2/LCImdG9s3bpStFzwCYQ8+/ewxQoErq0U
JaHl9vSrYmFVuZMKwc8dYTbm3zMwaWfYLjqvUJyNjFQgJcqbpDEojDomaFMa1Zc/
OnWFf9x2zQKBgQCO/vWiapCJRPmwsFMqT6TIwEFOn/FR4h8bPbMsh+cduMw7GYYD
feeSYrZ0CkcWh9TtOdyGM+zC7IfGOnOMLMp9CXNTSZf4SLlJ4dGFVf/YOeP2wpkS
nL94zJBljIRY7OsDI4PaFKY2Z+nfKNSYk12TG5UbiqKvTUW5MzKHL5tWWwKBgQCB
X2T83N/angGWhvlCfIk8kLQquAbrl+WGbz0oLQCsRSZiqYTjecUBhIT9mgpGnmJ1
CpRZ66Z+gtAS1zjY38UrTS0ZreSPTtB78MJH+WTZm294zY5RoaIwHBl+SjLTC1lx
m1ljzzBkBpjSC9TAFKrQrETwyo9yqXPFVNJCx3HHDQKBgCgaz+zWKv0GPZn4ikRi
L2JDJ1BVEvlyQ/GGF+Ju5oqusTxPoa4v6aIvGxaavbs1Bkku5CA3rCMWapTMqpcO
qiIOx4JyusJhEYpJFqU/+lHbYvOonDhqYPsm4D57KEo1JFrPn4B5Jg6/T7fr8yWg
RGmWOPq0WmEl6uSO9U9q5dG1
-----END PRIVATE KEY-----`;

const MOCK_GOOGLE_PUBLIC_KEY_SPKI = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAstigq0mW0M6mTPqBU+jm
vxXcPwdDb9Sl1yFCHUUpQ7y9sNDhW1//NJo6mFyCMGGumpUmd5t7j18s/OkIorFl
ELCF51pDbg6MfoKKDQek9ev1yEoKIBvycDVsS0+vF3kbmc0UHp+YZTYmrE65uyKj
XlmhZxBSPXbt6pwMEVowN901dUKtNJjw50Saa/1+tGKVIJrSoa1DImwc66tS0Ku4
VTuFmgIxoOUyxHpO8AVOZyVOIH/2qlraT4oPl3ge9O5MyQTrgZPj0VXkmzlVpy+A
Tjedw4YpyO9ZiGxL6ZdxyJlsxVcJpdqnK5U38KeyFsW6/W47ccOhROswbeBksh6v
+wIDAQAB
-----END PUBLIC KEY-----`;

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
  const privateKey = await importPKCS8(MOCK_GOOGLE_PRIVATE_KEY_PKCS8, 'RS256');
  const publicKey = await importSPKI(MOCK_GOOGLE_PUBLIC_KEY_SPKI, 'RS256');
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
