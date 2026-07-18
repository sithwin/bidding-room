import { describe, it, expect, vi } from 'vitest';
import { GoogleAuthUseCase } from './google-auth.use-case';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { TokenService } from './token-service';
import { GoogleIdentityProvider } from './google-identity-provider';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByGoogleId: vi.fn(),
  findAll: vi.fn(),
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

const makeTokenService = () =>
  ({
    issueAccessToken: vi.fn().mockReturnValue('access-token'),
    issueRefreshToken: vi.fn().mockReturnValue('refresh-token'),
    hashRefreshToken: vi.fn().mockReturnValue('hashed-refresh'),
    verifyAccessToken: vi.fn(),
  } as unknown as TokenService);

const makeGoogleIdentityProvider = (): GoogleIdentityProvider => ({
  exchangeCodeForProfile: vi.fn(),
});

describe('GoogleAuthUseCase', () => {
  it('should_createNewUser_when_noAccountMatchesGoogleIdOrEmail', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'new.user@example.com',
      emailVerified: true,
    });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    const result = await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).toHaveBeenCalledOnce();
    const savedUser = (userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(savedUser.email).toBe('new.user@example.com');
    expect(savedUser.googleId).toBe('google-sub-123');
    expect(savedUser.authProvider).toBe('GOOGLE');
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('should_linkGoogleAccount_when_emailMatchesExistingPasswordAccount', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'existing@example.com',
      emailVerified: true,
    });
    const existing = User.create({ id: 'u-1', email: 'existing@example.com', passwordHash: 'h', role: UserRole.BUYER });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).toHaveBeenCalledWith(existing);
    expect(existing.googleId).toBe('google-sub-123');
    expect(existing.authProvider).toBe('BOTH');
  });

  it('should_logInWithoutSaving_when_googleIdAlreadyLinked', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'returning@example.com',
      emailVerified: true,
    });
    const existing = User.createFromGoogle({ id: 'u-1', email: 'returning@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });
    (userRepo.findByGoogleId as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);
    const result = await sut.execute({ code: 'auth-code', codeVerifier: 'verifier' });

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('should_throwError_when_googleReportsEmailNotVerified', async () => {
    const userRepo = makeUserRepo();
    const tokenRepo = makeTokenRepo();
    const tokenService = makeTokenService();
    const googleIdentityProvider = makeGoogleIdentityProvider();
    (googleIdentityProvider.exchangeCodeForProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      providerId: 'google-sub-123',
      email: 'unverified@example.com',
      emailVerified: false,
    });

    const sut = new GoogleAuthUseCase(userRepo, tokenRepo, tokenService, googleIdentityProvider);

    await expect(sut.execute({ code: 'auth-code', codeVerifier: 'verifier' })).rejects.toThrow(
      'Google email not verified',
    );
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
