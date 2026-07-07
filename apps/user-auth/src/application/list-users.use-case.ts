import { User } from '../domain/user';
import { UserRepository, UserListFilter } from '../domain/user-repository';

export class ListUsersUseCase {
  constructor(private readonly userRepo: UserRepository) {}

  async execute(filter: UserListFilter): Promise<User[]> {
    return this.userRepo.findAll(filter);
  }
}
