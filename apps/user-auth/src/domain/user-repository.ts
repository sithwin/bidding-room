import { User } from './user';

export interface UserListFilter {
  status?: string;
  search?: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findAll(filter: UserListFilter): Promise<User[]>;
  save(user: User): Promise<void>;
}
