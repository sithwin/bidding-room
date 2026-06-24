import { serve } from '@hono/node-server';
import { Hono } from 'hono';
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
import { buildUserRouter } from './presentation/user-router';
import { createAmqpConnection, EventPublisher } from '@carat-room/shared-events';
import { authMiddleware, JwtPayload } from '@carat-room/shared-auth';

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const amqpUrl = process.env.AMQP_URL;
  const jwtPrivateKey = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const jwtPublicKey = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  const port = Number(process.env.PORT ?? 3001);

  const R2_ACCOUNT_ID        = process.env['R2_ACCOUNT_ID']!;
  const R2_ACCESS_KEY_ID     = process.env['R2_ACCESS_KEY_ID']!;
  const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY']!;
  const R2_BUCKET_NAME       = process.env['R2_BUCKET_NAME']!;

  if (!databaseUrl || !amqpUrl || !jwtPrivateKey || !jwtPublicKey) {
    throw new Error(
      'Missing required environment variables: DATABASE_URL, AMQP_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY',
    );
  }

  const db = createDb(databaseUrl);
  const userRepo = new PostgresUserRepository(db);
  const tokenRepo = new PostgresTokenRepository(db);

  const passwordService = new PasswordService();
  const tokenService = new TokenService({ privateKeyPem: jwtPrivateKey, publicKeyPem: jwtPublicKey });
  const otpService = new OtpService();

  const amqp = await createAmqpConnection(amqpUrl);
  const publisher = new EventPublisher(amqp);

  const app = new Hono<AppEnv>();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'user-auth' }));

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

  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
