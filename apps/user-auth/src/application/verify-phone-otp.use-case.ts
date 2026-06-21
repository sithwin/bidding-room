import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';

interface VerifyPhoneOtpDto {
  userId: string;
  code: string;
}

export class VerifyPhoneOtpUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async execute(dto: VerifyPhoneOtpDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const token = await this.tokenRepo.findVerificationToken({
      userId: dto.userId,
      type: 'PHONE',
      code: dto.code,
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new Error('Invalid or expired OTP');
    }

    user.verifyPhone();
    await this.userRepo.save(user);
    await this.tokenRepo.markVerificationTokenUsed(token.id);
  }
}
