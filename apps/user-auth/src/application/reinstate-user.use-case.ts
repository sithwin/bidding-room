import { UserRepository } from '../domain/user-repository';

export class ReinstateUserUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error('User not found');
    user.reinstate();
    await this.userRepo.save(user);
  }
}
