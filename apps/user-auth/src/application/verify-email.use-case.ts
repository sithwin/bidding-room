import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';

interface VerifyEmailDto {
  userId: string;
  code: string;
}

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async execute(dto: VerifyEmailDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const token = await this.tokenRepo.findVerificationToken({
      userId: dto.userId,
      type: 'EMAIL',
      code: dto.code,
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired token');
    }

    user.verifyEmail();
    await this.userRepo.save(user);
    await this.tokenRepo.markVerificationTokenUsed(token.id);
  }
}
