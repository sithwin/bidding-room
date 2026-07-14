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
import Redis from 'ioredis';
import { buildUserAuthRateLimits } from './presentation/rate-limits';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.RABBITMQ_URL;
  const jwtPrivateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  const port = Number(process.env.PORT ?? 3001);
  const redisHost = process.env.REDIS_HOST ?? 'localhost';
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);

  const R2_ACCOUNT_ID        = process.env['R2_ACCOUNT_ID']!;
  const R2_ACCESS_KEY_ID     = process.env['R2_ACCESS_KEY_ID']!;
  const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']!;
  const R2_BUCKET_NAME       = process.env['R2_BUCKET_NAME']!;

  if (!databaseUrl || !amqpUrl || !jwtPrivateKey || !jwtPublicKey) {
    throw new Error(
      'Missing required environment variables: DATABASE_URL, RABBITMQ_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY',
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

  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));

  const redis = new Redis({ host: redisHost, port: redisPort });
  const rateLimits = buildUserAuthRateLimits(redis);

  app.use('*', rateLimits.default);
  app.use('/api/users/login', rateLimits.strict);
  app.use('/api/users/register', rateLimits.strict);
  app.use('/api/users/verify-email', rateLimits.strict);
  app.use('/api/users/phone/request', rateLimits.strict);
  app.use('/api/users/phone/verify', rateLimits.strict);
  app.use('/api/users/refresh', rateLimits.refresh);

  app.use('/api/users/phone/*', authMiddleware(jwtPublicKey));
  app.use('/api/users/me', authMiddleware(jwtPublicKey));
  app.use('/api/users/identity-document', authMiddleware(jwtPublicKey));

  const r2 = new R2UploadClient({
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucketName: R2_BUCKET_NAME,
  });

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
  }));

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
  console.error('Fatal error:', err);
  process.exit(1);
});
