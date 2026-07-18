export interface GoogleProfile {
  providerId: string;
  email: string;
  emailVerified: boolean;
}

export interface GoogleIdentityProvider {
  exchangeCodeForProfile(code: string, codeVerifier: string): Promise<GoogleProfile>;
}
