import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleOAuthIdentityProvider } from './google-identity-provider';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const REDIRECT_URI = 'https://portal.example.com/api/auth/google/callback';

describe('GoogleOAuthIdentityProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should_returnProfile_when_tokenExchangeAndVerificationSucceed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const verifyIdToken = vi.fn().mockResolvedValue({
      sub: 'google-sub-123',
      email: 'jane@example.com',
      email_verified: true,
    });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);
    const profile = await sut.exchangeCodeForProfile('auth-code', 'code-verifier');

    expect(profile).toEqual({ providerId: 'google-sub-123', email: 'jane@example.com', emailVerified: true });
    expect(verifyIdToken).toHaveBeenCalledWith('fake-id-token');
    const [, requestInit] = fetchMock.mock.calls[0];
    const body = requestInit.body as URLSearchParams;
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe('code-verifier');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('should_reportEmailNotVerified_when_googleClaimIsFalse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    ));
    const verifyIdToken = vi.fn().mockResolvedValue({
      sub: 'google-sub-123',
      email: 'jane@example.com',
      email_verified: false,
    });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);
    const profile = await sut.exchangeCodeForProfile('auth-code', 'code-verifier');

    expect(profile.emailVerified).toBe(false);
  });

  it('should_throwError_when_tokenExchangeFails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })));
    const verifyIdToken = vi.fn();

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);

    await expect(sut.exchangeCodeForProfile('bad-code', 'code-verifier')).rejects.toThrow(
      'Google token exchange failed',
    );
  });

  it('should_throwError_when_idTokenMissingEmailClaim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'fake-id-token' }), { status: 200 }),
    ));
    const verifyIdToken = vi.fn().mockResolvedValue({ sub: 'google-sub-123' });

    const sut = new GoogleOAuthIdentityProvider(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, verifyIdToken);

    await expect(sut.exchangeCodeForProfile('auth-code', 'code-verifier')).rejects.toThrow(
      'Google id_token is missing required claims',
    );
  });
});
