import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GoogleIdentityProvider, GoogleProfile } from '../../application/google-identity-provider';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUER = 'https://accounts.google.com';

interface GoogleTokenResponse {
  id_token: string;
}

interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export type IdTokenVerifier = (idToken: string) => Promise<GoogleIdTokenClaims>;

export function createGoogleIdTokenVerifier(clientId: string): IdTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return async (idToken: string) => {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUER,
      audience: clientId,
    });
    return payload as GoogleIdTokenClaims;
  };
}

export class GoogleOAuthIdentityProvider implements GoogleIdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly verifyIdToken: IdTokenVerifier,
  ) {}

  async exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error('Google token exchange failed');
    }

    const body = (await response.json()) as GoogleTokenResponse;
    const claims = await this.verifyIdToken(body.id_token);

    if (typeof claims.email !== 'string') {
      throw new Error('Google id_token is missing required claims');
    }

    return {
      providerId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
    };
  }
}
