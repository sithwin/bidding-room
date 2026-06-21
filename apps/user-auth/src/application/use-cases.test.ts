import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUseCase } from './register.use-case';
import { VerifyEmailUseCase } from './verify-email.use-case';
import { LoginUseCase } from './login.use-case';
import { RequestPhoneOtpUseCase } from './request-phone-otp.use-case';
import { VerifyPhoneOtpUseCase } from './verify-phone-otp.use-case';
import { User, UserRole, UserStatus } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { TokenService } from './token-service';
import { OtpService } from './otp-service';
import { EventPublisher } from '@carat-room/shared-events';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  save: vi.fn(),
});

const makeTokenRepo = (): TokenRepository => ({
  saveVerificationToken: vi.fn(),
  findVerificationToken: vi.fn(),
  markVerificationTokenUsed: vi.fn(),
  countRecentPhoneAttempts: vi.fn(),
  saveRefreshToken: vi.fn(),
  findRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
});

const makePasswordService = () =>
  ({ hash: vi.fn(), verify: vi.fn() } as unknown as PasswordService);

const makeTokenService = () =>
  ({
    issueAccessToken: vi.fn().mockReturnValue('access-token'),
    issueRefreshToken: vi.fn().mockReturnValue('refresh-token'),
    hashRefreshToken: vi.fn().mockReturnValue('hashed-refresh'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenService);

const makeOtpService = () =>
  ({ generate: vi.fn().mockReturnValue('123456') } as unknown as OtpService);

const makePublisher = () =>
  ({ publish: vi.fn() } as unknown as EventPublisher);

describe('RegisterUseCase', () => {
  it('should_saveUserAndPublishEvent_when_emailNotTaken', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const publisher = makePublisher();
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');

    const sut = new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher);
    await sut.execute({ email: 'jane@example.com', password: 'secret123' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    expect(tokenRepo.saveVerificationToken).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_emailAlreadyTaken', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const publisher = makePublisher();
    const existing = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new RegisterUseCase(userRepo, tokenRepo, passwordService, publisher);

    await expect(
      sut.execute({ email: 'jane@example.com', password: 'secret123' }),
    ).rejects.toThrow('Email already registered');
  });
});

describe('VerifyEmailUseCase', () => {
  it('should_verifyEmailAndUpdateUser_when_tokenValid', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.findVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tok-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    const sut = new VerifyEmailUseCase(userRepo, tokenRepo);
    await sut.execute({ userId: 'u-1', code: '123456' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    expect(tokenRepo.markVerificationTokenUsed).toHaveBeenCalledWith('tok-1');
    const saved = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(saved.status).toBe(UserStatus.EMAIL_VERIFIED);
  });

  it('should_throwError_when_tokenNotFound', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.findVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new VerifyEmailUseCase(userRepo, tokenRepo);

    await expect(sut.execute({ userId: 'u-1', code: '000000' })).rejects.toThrow('Invalid or expired token');
  });
});

describe('LoginUseCase', () => {
  it('should_returnTokens_when_credentialsValid', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const tokenService = makeTokenService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'hash', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.verify as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    const sut = new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService);
    const result = await sut.execute({ email: 'jane@example.com', password: 'secret' });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(tokenRepo.saveRefreshToken).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_passwordWrong', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const passwordService = makePasswordService();
    const tokenService = makeTokenService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'hash', role: UserRole.BUYER });
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.verify as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const sut = new LoginUseCase(userRepo, tokenRepo, passwordService, tokenService);

    await expect(
      sut.execute({ email: 'jane@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials');
  });
});

describe('RequestPhoneOtpUseCase', () => {
  it('should_saveOtpAndPublishEvent_when_notLockedOut', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const otpService = makeOtpService();
    const publisher = makePublisher();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.countRecentPhoneAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const sut = new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher);
    await sut.execute({ userId: 'u-1', phone: '+61412345678' });

    expect(tokenRepo.saveVerificationToken).toHaveBeenCalledOnce();
    expect(publisher.publish).toHaveBeenCalledOnce();
  });

  it('should_throwError_when_tooManyAttempts', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const otpService = makeOtpService();
    const publisher = makePublisher();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });
    user.verifyEmail();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (tokenRepo.countRecentPhoneAttempts as ReturnType<typeof vi.fn>).mockResolvedValue(3);

    const sut = new RequestPhoneOtpUseCase(userRepo, tokenRepo, otpService, publisher);

    await expect(
      sut.execute({ userId: 'u-1', phone: '+61412345678' }),
    ).rejects.toThrow('Too many OTP attempts. Please wait 15 minutes.');
  });
});
