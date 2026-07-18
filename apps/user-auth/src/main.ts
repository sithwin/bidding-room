import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { runMigrations } from '@carat-room/db-migrate';
import { createDb } from './infrastructure/db/db';
import { PostgresUserRepository } from './infrastructure/db/postgres-user-repository';
import { PostgresTokenRepository } from './infrastructure/db/postgres-token-repository';
import { PasswordService } from './application/password-service';
import { TokenService } from './application/token-service';
import { OtpService } from './application/otp-service';
import { RegisterUseCase } from './application/register.use-case';
import { VerifyEmailUseCase } from './application/verify-email.use-case';
import { LoginUseCase } from './application/login.use-case';
import { RefreshUseCase } from './application/refresh.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RequestPhoneOtpUseCase } from './application/request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from './application/verify-phone-otp.use-case';
import { GetMeUseCase } from './application/get-me.use-case';
import { UpdateMeUseCase } from './application/update-me.use-case';
import { UploadIdentityDocumentUseCase } from './application/upload-identity-document.use-case';
import { R2UploadClient } from './infrastructure/r2/r2-upload-client';
import { TurnstileVerifier } from './infrastructure/turnstile/turnstile-verifier';
import { GoogleOAuthIdentityProvider, createGoogleIdTokenVerifier } from './infrastructure/google/google-identity-provider';
import { GoogleAuthUseCase } from './application/google-auth.use-case';
import { SetPasswordUseCase } from './application/set-password.use-case';
import { ListUsersUseCase } from './application/list-users.use-case';
import { SuspendUserUseCase } from './application/suspend-user.use-case';
import { ReinstateUserUseCase } from './application/reinstate-user.use-case';
import { ApproveUserUseCase } from './application/approve-user.use-case';
import { AdminCreateUserUseCase } from './application/admin-create-user.use-case';
import { AdminUpdateUserUseCase } from './application/admin-update-user.use-case';
import { buildUserRouter } from './presentation/user-router';
import { buildAdminUsersRouter } from './presentation/admin-users-router';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';
import { createLogger, requestContextMiddleware } from '@carat-room/shared-logger';
import { createMetrics, httpMetricsMiddleware, metricsRoute } from '@carat-room/shared-metrics';
import Redis from 'ioredis';
import { buildUserAuthRateLimits } from './presentation/rate-limits';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.RABBITMQ_URL;
  const jwtPrivateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY;
  // Gates POST /api/users/admin-login (see internal-service-auth-middleware.ts) instead of
  // Turnstile — deliberately NOT part of the fail-fast check below: an unset/empty value simply
  // means /admin-login always 401s (fail-closed), so it must not block deployments (e.g. local dev)
  // that never run admin-portal.
  const adminLoginInternalSecret = process.env.ADMIN_LOGIN_INTERNAL_SECRET ?? '';
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
  // Both undefined in production, falling through to the real Google URLs (see
  // createGoogleIdTokenVerifier/GoogleOAuthIdentityProvider's defaults) — only the E2E test stack
  // sets these, pointing user-auth's server-to-server token exchange and JWKS fetch at the mock
  // Google server started by tests/e2e/global-setup.ts (docker-compose.test.yml's user-auth block).
  const googleTokenEndpointOverride = process.env.GOOGLE_TOKEN_ENDPOINT_OVERRIDE;
  const googleJwksUrlOverride = process.env.GOOGLE_JWKS_URL_OVERRIDE;
  const port = Number(process.env.PORT ?? 3001);
  const redisHost = process.env.REDIS_HOST ?? 'localhost';
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);

  const R2_ACCOUNT_ID        = process.env['R2_ACCOUNT_ID']!;
  const R2_ACCESS_KEY_ID     = process.env['R2_ACCESS_KEY_ID']!;
  const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']!;
  const R2_BUCKET_NAME       = process.env['R2_BUCKET_NAME']!;

  if (
    !databaseUrl ||
    !amqpUrl ||
    !jwtPrivateKey ||
    !jwtPublicKey ||
    !turnstileSecretKey ||
    !googleClientId ||
    !googleClientSecret ||
    !googleRedirectUri
  ) {
    throw new Error(
      'Missing required environment variables: DATABASE_URL, RABBITMQ_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, TURNSTILE_SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI',
    );
  }

  const db = createDb(databaseUrl);
  await runMigrations(db, join(__dirname, '..', 'migrations'));
  const userRepo = new PostgresUserRepository(db);
  const tokenRepo = new PostgresTokenRepository(db);

  const passwordService = new PasswordService();
  const tokenService = new TokenService({ privateKeyPem: jwtPrivateKey, publicKeyPem: jwtPublicKey });
  const otpService = new OtpService();

  const amqp = await createAmqpConnection(amqpUrl);
  const publisher = new EventPublisher(amqp);

  const logger = createLogger({ service: 'user-auth', pretty: process.env.NODE_ENV !== 'production' });
  const metrics = createMetrics({ service: 'user-auth' });

  const app = new Hono<AppEnv>();

  app.use('*', requestContextMiddleware(logger));
  app.use('*', httpMetricsMiddleware(metrics));

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));
  app.get('/metrics', metricsRoute(metrics));

  const redis = new Redis({ host: redisHost, port: redisPort });
  const rateLimits = buildUserAuthRateLimits(redis);

  app.use('*', rateLimits.default);
  app.use('/api/users/login', rateLimits.strict);
  app.use('/api/users/admin-login', rateLimits.strict);
  app.use('/api/users/register', rateLimits.strict);
  app.use('/api/users/verify-email', rateLimits.strict);
  app.use('/api/users/phone/request', rateLimits.strict);
  app.use('/api/users/phone/verify', rateLimits.strict);
  app.use('/api/users/refresh', rateLimits.refresh);
  app.use('/api/users/auth/google', rateLimits.strict);

  app.use('/api/users/phone/*', authMiddleware(jwtPublicKey));
  app.use('/api/users/me', authMiddleware(jwtPublicKey));
  app.use('/api/users/me/password', authMiddleware(jwtPublicKey));
  app.use('/api/users/identity-document', authMiddleware(jwtPublicKey));

  const r2 = new R2UploadClient({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucketName: R2_BUCKET_NAME,
  });

  const humanVerifier = new TurnstileVerifier(turnstileSecretKey);

  const googleIdentityProvider = new GoogleOAuthIdentityProvider(
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    createGoogleIdTokenVerifier(googleClientId, googleJwksUrlOverride),
    googleTokenEndpointOverride,
  );

  app.route('/api/users', buildUserRouter({
    register:                new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher),
    verifyEmail:             new VerifyEmailUseCase(userRepo, tokenRepo),
    login:                   new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService),
    refresh:                 new RefreshUseCase(userRepo, tokenRepo, tokenService),
    logout:                  new LogoutUseCase(tokenRepo, tokenService),
    requestPhoneOtp:         new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher),
    verifyPhoneOtp:          new VerifyPhoneOtpUseCase(userRepo, tokenRepo),
    getMe:                   new GetMeUseCase(userRepo),
    updateMe:                new UpdateMeUseCase(userRepo),
    uploadIdentityDocument:  new UploadIdentityDocumentUseCase(userRepo, r2),
    googleAuth:              new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider),
    setPassword:             new SetPasswordUseCase(userRepo, passwordService),
  }, humanVerifier, adminLoginInternalSecret));

  // Admin routes mounted after the public router so specific paths like /me match first
  app.route('/api/users', buildAdminUsersRouter({
    listUsers:     new ListUsersUseCase(userRepo),
    getUser:       new GetMeUseCase(userRepo),
    suspendUser:   new SuspendUserUseCase(userRepo),
    reinstateUser: new ReinstateUserUseCase(userRepo),
    approveUser:   new ApproveUserUseCase(userRepo),
    adminCreateUser: new AdminCreateUserUseCase(userRepo, tokenRepo, passwordService, publisher),
    adminUpdateUser: new AdminUpdateUserUseCase(userRepo),
  }, jwtPublicKey));

  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  createLogger({ service: 'user-auth' }).fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
