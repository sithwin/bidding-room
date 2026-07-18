import { UserRepository } from '../domain/user-repository';
import { PasswordService } from './password-service';

interface SetPasswordDto {
  userId: string;
  password: string;
}

export class SetPasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(dto: SetPasswordDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    user.setPassword(passwordHash);
    await this.userRepo.save(user);
  }
}
