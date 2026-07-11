import { accessTokenResponseSchema, apiErrorSchema, type Me, meResponseSchema, stringErrorSchema } from '@carat-room/shared-types';

// Contract boundary: every user-auth response is parsed through the shared
// schema. Drift logs and degrades to the fallback — pages never crash on a
// malformed response, they treat it as a logged-out / failed state.

export function parseAccessToken(json: unknown): string | null {
  const parsed = accessTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Access-token response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data.accessToken;
}

export function parseMe(json: unknown): Me | null {
  const parsed = meResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error('Me response failed contract validation', parsed.error.issues);
    return null;
  }
  return parsed.data.data;
}

/** Extracts a human-readable message from either service error shape. */
export function errorMessage(json: unknown, fallback: string): string {
  const structured = apiErrorSchema.safeParse(json);
  if (structured.success) return structured.data.error.message;
  const bare = stringErrorSchema.safeParse(json);
  if (bare.success) return bare.data.error;
  return fallback;
}
