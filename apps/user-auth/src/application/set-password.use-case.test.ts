import { describe, it, expect, vi } from 'vitest';
import { SetPasswordUseCase } from './set-password.use-case';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { PasswordService } from './password-service';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByGoogleId: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
});

const makePasswordService = () =>
  ({ hash: vi.fn(), verify: vi.fn() } as unknown as PasswordService);

describe('SetPasswordUseCase', () => {
  it('should_setPasswordAndSave_when_userHasNoPasswordYet', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hash');

    const sut = new SetPasswordUseCase(userRepo, passwordService);
    await sut.execute({ userId: 'u-1', password: 'new-secret-123' });

    expect(user.passwordHash).toBe('new-hash');
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it('should_throwError_when_userNotFound', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const sut = new SetPasswordUseCase(userRepo, passwordService);

    await expect(sut.execute({ userId: 'missing', password: 'new-secret-123' })).rejects.toThrow('User not found');
  });

  it('should_throwError_when_passwordAlreadySet', async () => {
    const userRepo = makeUserRepo();
    const passwordService = makePasswordService();
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'existing-hash', role: UserRole.BUYER });
    (userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (passwordService.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hash');

    const sut = new SetPasswordUseCase(userRepo, passwordService);

    await expect(sut.execute({ userId: 'u-1', password: 'new-secret-123' })).rejects.toThrow('Password already set');
    expect(userRepo.save).not.toHaveBeenCalled();
  });
});
