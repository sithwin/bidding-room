import { UserRepository } from '../domain/user-repository';

interface AdminUpdateUserDto {
  email?: string;
  country?: string;
}

export class AdminUpdateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(id: string, dto: AdminUpdateUserDto): Promise<void> {
    const user = await this.userRepo.findById(id);
    if (!user) throw new Error('User not found');

    if (dto.email !== undefined && dto.email !== user.email) {
      const existing = await this.userRepo.findByEmail(dto.email);
      if (existing && existing.id !== id) throw new Error('Email already registered');
      user.changeEmail(dto.email);
    }
    if (dto.country !== undefined) {
      user.updateProfile({ country: dto.country });
    }
    await this.userRepo.save(user);
  }
}
