import { z } from 'zod';
import { envelope } from './envelope';

// Transcribed from apps/user-auth/src/presentation/{user-router,admin-users-router}.ts.
// Reality notes: GET /:id/email, GET /health and POST /identity-document are bare
// (no { data } envelope); identity-document errors are { error: string }, not
// { error: { code, message } }. Schemas record reality, they do not normalise it.

export const userStatusSchema = z.enum([
  'REGISTERED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'PENDING_REVIEW', 'APPROVED_BIDDER', 'SUSPENDED',
]);
export const userRoleSchema = z.enum(['BUYER', 'ADMIN']);

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export const stringErrorSchema = z.object({ error: z.string() });

export const messageResponseSchema = envelope(z.object({ message: z.string() }));
export const accessTokenResponseSchema = envelope(z.object({ accessToken: z.string() }));

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  role: userRoleSchema,
  country: z.string().nullable(),
});
export const meResponseSchema = envelope(meSchema);

export const emailLookupResponseSchema = z.object({ email: z.string() });
export const identityDocumentResponseSchema = z.object({ status: z.literal('pending_review') });

export const adminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  status: userStatusSchema,
  country: z.string().nullable(),
  registeredAt: z.string(), // ISO-8601, mapped from createdAt in the admin router
});
export const adminUserDetailSchema = adminUserSummarySchema.extend({
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
});
export const adminUserListResponseSchema = envelope(z.array(adminUserSummarySchema)); // no meta
export const adminUserResponseSchema = envelope(adminUserDetailSchema);
export const adminUserIdResponseSchema = envelope(z.object({ id: z.string() }));

// Request bodies — field names are exactly what the routers destructure.
export const registerRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
  country: z.string().optional(),
});
export const loginRequestSchema = z.object({ email: z.string(), password: z.string() });
export const verifyEmailRequestSchema = z.object({ userId: z.string(), code: z.string() });
export const phoneRequestSchema = z.object({ phone: z.string() });
export const phoneVerifyRequestSchema = z.object({ code: z.string() });
export const updateProfileRequestSchema = z.object({ country: z.string().optional() });
export const adminCreateUserRequestSchema = z.object({
  email: z.string(),
  password: z.string(),
  role: userRoleSchema,
  country: z.string().optional(),
});
export const adminUpdateUserRequestSchema = z.object({
  email: z.string().optional(),
  country: z.string().optional(),
});

export type Me = z.infer<typeof meSchema>;
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** Query builder for GET /api/users (admin list). Params are exactly what the router reads. */
export function usersQuery(params: { status?: string; search?: string }): URLSearchParams {
  const query = new URLSearchParams();
  if (params.status !== undefined) query.set('status', params.status);
  if (params.search !== undefined) query.set('search', params.search);
  return query;
}
