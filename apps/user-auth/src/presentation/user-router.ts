import { Hono } from 'hono';
import { setCookie, getCookie } from 'hono/cookie';
import { RegisterUseCase } from '../application/register.use-case';
import { VerifyEmailUseCase } from '../application/verify-email.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { RefreshUseCase } from '../application/refresh.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RequestPhoneOtpUseCase } from '../application/request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from '../application/verify-phone-otp.use-case';
import { GetMeUseCase } from '../application/get-me.use-case';
import { UpdateMeUseCase } from '../application/update-me.use-case';
import { UploadIdentityDocumentUseCase } from '../application/upload-identity-document.use-case';
import { JwtPayload } from '@carat-room/shared-auth';

interface UseCases {
  register: RegisterUseCase;
  verifyEmail: VerifyEmailUseCase;
  login: LoginUseCase;
  refresh: RefreshUseCase;
  logout: LogoutUseCase;
  requestPhoneOtp: RequestPhoneOtpUseCase;
  verifyPhoneOtp: VerifyPhoneOtpUseCase;
  getMe: GetMeUseCase;
  updateMe: UpdateMeUseCase;
  uploadIdentityDocument: UploadIdentityDocumentUseCase;
}

type AppEnv = { Variables: { jwtPayload: JwtPayload } };

const REFRESH_COOKIE = 'carat_refresh';

export function buildUserRouter(useCases: UseCases): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.get('/:id/email', async (c) => {
    try {
      const user = await useCases.getMe.execute(c.req.param('id'));
      return c.json({ email: user.email });
    } catch {
      return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
    }
  });

  router.post('/register', async (c) => {
    const body = await c.req.json();
    const { email, password, country } = body;
    if (!email || !password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email and password are required' } },
        400,
      );
    }
    try {
      await useCases.register.execute({ email, password, country });
      return c.json(
        { data: { message: 'Registration successful. Check your email to verify your account.' } },
        201,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Email already registered') {
        return c.json({ error: { code: 'CONFLICT', message: 'Email already registered' } }, 409);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/verify-email', async (c) => {
    const body = await c.req.json();
    const { userId, code } = body;
    if (!userId || !code) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'userId and code are required' } },
        400,
      );
    }
    try {
      await useCases.verifyEmail.execute({ userId, code });
      return c.json({ data: { message: 'Email verified successfully.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid or expired token') {
        return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid or expired token' } }, 400);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/login', async (c) => {
    const body = await c.req.json();
    const { email, password } = body;
    if (!email || !password) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email and password are required' } },
        400,
      );
    }
    try {
      const { accessToken, refreshToken } = await useCases.login.execute({ email, password });
      setCookie(c, REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
      return c.json({ data: { accessToken } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid credentials') {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } }, 401);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/refresh', async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (!refreshToken) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token' } }, 401);
    }
    try {
      const result = await useCases.refresh.execute({ refreshToken });
      setCookie(c, REFRESH_COOKIE, result.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });
      return c.json({ data: { accessToken: result.accessToken } });
    } catch {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' } },
        401,
      );
    }
  });

  router.post('/logout', async (c) => {
    const refreshToken = getCookie(c, REFRESH_COOKIE);
    if (refreshToken) {
      await useCases.logout.execute({ refreshToken });
    }
    setCookie(c, REFRESH_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
    return c.json({ data: { message: 'Logged out.' } });
  });

  router.post('/phone/request', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    const { phone } = body;
    if (!phone) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'phone is required' } }, 400);
    }
    try {
      await useCases.requestPhoneOtp.execute({ userId, phone });
      return c.json({ data: { message: 'OTP sent.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Too many OTP attempts')) {
        return c.json({ error: { code: 'TOO_MANY_REQUESTS', message } }, 429);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.post('/phone/verify', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    const { code } = body;
    if (!code) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'code is required' } }, 400);
    }
    try {
      await useCases.verifyPhoneOtp.execute({ userId, code });
      return c.json({ data: { message: 'Phone verified. You are now an approved bidder.' } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Invalid or expired OTP') {
        return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid or expired OTP' } }, 400);
      }
      return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
    }
  });

  router.get('/me', async (c) => {
    const { userId } = c.get('jwtPayload');
    const user = await useCases.getMe.execute(userId);
    const p = user.toProps();
    return c.json({
      data: {
        id: p.id,
        email: p.email,
        phone: p.phone,
        status: p.status,
        role: p.role,
        country: p.country,
      },
    });
  });

  router.patch('/me', async (c) => {
    const { userId } = c.get('jwtPayload');
    const body = await c.req.json();
    await useCases.updateMe.execute({ userId, country: body.country });
    return c.json({ data: { message: 'Profile updated.' } });
  });

  router.post('/identity-document', async (c) => {
    const payload = c.get('jwtPayload');
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
      return c.json({ error: 'Missing file field' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await useCases.uploadIdentityDocument.execute({
        userId: payload.userId,
        fileBuffer: buffer,
        contentType: file.type,
        originalFilename: file.name,
      });
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      return c.json({ error: message }, 422);
    }
  });

  return router;
}
