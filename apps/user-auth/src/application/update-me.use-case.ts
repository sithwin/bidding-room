import { UserRepository } from '../domain/user-repository';

interface UpdateMeDto {
  userId: string;
  country?: string;
}

export class UpdateMeUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(dto: UpdateMeDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');
    user.updateProfile({ country: dto.country });
    await this.userRepo.save(user);
  }
}
