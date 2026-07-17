import { describe, expect, it, vi } from 'vitest';
import { AdminCreateUserUseCase } from './admin-create-user.use-case';
import { AdminUpdateUserUseCase } from './admin-update-user.use-case';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { PasswordService } from './password-service';
import { EventPublisher } from '@carat-room/shared-events';

const makeUserRepo = (): UserRepository => ({
  findById: vi.fn().mockResolvedValue(null),
  findByEmail: vi.fn().mockResolvedValue(null),
  findByGoogleId: vi.fn().mockResolvedValue(null),
  findAll: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
});

const makeTokenRepo = () =>
  ({ saveVerificationToken: vi.fn().mockResolvedValue(undefined) } as unknown as TokenRepository);

const makePasswordService = () =>
  ({ hash: vi.fn().mockResolvedValue('hashed') } as unknown as PasswordService);

const makePublisher = () =>
  ({ publish: vi.fn().mockResolvedValue(undefined) } as unknown as EventPublisher);

const makeRepos = () => ({
  userRepo: makeUserRepo(),
  tokenRepo: makeTokenRepo(),
  passwordService: makePasswordService(),
  publisher: makePublisher(),
});

describe('AdminCreateUserUseCase', () => {
  it('creates a user with the given role and publishes user.registered', async () => {
    const deps = makeRepos();
    const useCase = new AdminCreateUserUseCase(deps.userRepo, deps.tokenRepo, deps.passwordService, deps.publisher);

    const result = await useCase.execute({ email: 'buyer@example.com', password: 'CorrectHorse9!', role: 'BUYER' });

    expect(result.id).toBeTruthy();
    expect(deps.userRepo.save).toHaveBeenCalledOnce();
    const saved = (deps.userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(saved.email).toBe('buyer@example.com');
    expect(saved.role).toBe(UserRole.BUYER);
    expect((deps.publisher.publish as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it('rejects a duplicate email', async () => {
    const deps = makeRepos();
    (deps.userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      User.create({ id: 'u1', email: 'buyer@example.com', passwordHash: 'h', role: UserRole.BUYER }),
    );
    const useCase = new AdminCreateUserUseCase(deps.userRepo, deps.tokenRepo, deps.passwordService, deps.publisher);

    await expect(useCase.execute({ email: 'buyer@example.com', password: 'CorrectHorse9!', role: 'BUYER' }))
      .rejects.toThrow('Email already registered');
  });
});

describe('AdminUpdateUserUseCase', () => {
  const existing = () => User.create({ id: 'u1', email: 'old@example.com', passwordHash: 'h', role: UserRole.BUYER });

  it('updates email and country', async () => {
    const deps = makeRepos();
    (deps.userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing());
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);

    await useCase.execute('u1', { email: 'new@example.com', country: 'GB' });

    const saved = (deps.userRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as User;
    expect(saved.email).toBe('new@example.com');
    expect(saved.country).toBe('GB');
  });

  it('throws when the user does not exist', async () => {
    const deps = makeRepos();
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);
    await expect(useCase.execute('missing', { country: 'GB' })).rejects.toThrow('User not found');
  });

  it('rejects an email already used by another user', async () => {
    const deps = makeRepos();
    (deps.userRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(existing());
    (deps.userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      User.create({ id: 'u2', email: 'taken@example.com', passwordHash: 'h', role: UserRole.BUYER }),
    );
    const useCase = new AdminUpdateUserUseCase(deps.userRepo);
    await expect(useCase.execute('u1', { email: 'taken@example.com' })).rejects.toThrow('Email already registered');
  });
});
