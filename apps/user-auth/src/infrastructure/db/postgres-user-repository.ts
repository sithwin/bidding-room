import { Db } from './db';
import { User, UserProps, UserRole, UserStatus } from '../../domain/user';
import { UserRepository } from '../../domain/user-repository';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  phone: string | null;
  status: string;
  role: string;
  country: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
    return row ? this.toEntity(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
    return row ? this.toEntity(row) : null;
  }

  async save(user: User): Promise<void> {
    const props = user.toProps();
    await this.db`
      INSERT INTO users (id, email, password_hash, phone, status, role, country, created_at, updated_at)
      VALUES (${props.id}, ${props.email}, ${props.passwordHash}, ${props.phone}, ${props.status}, ${props.role}, ${props.country}, ${props.createdAt}, ${props.updatedAt})
      -- ON CONFLICT: email and password_hash are intentionally immutable after creation — only mutable fields are updated
      ON CONFLICT (id) DO UPDATE
        SET phone      = EXCLUDED.phone,
            status     = EXCLUDED.status,
            country    = EXCLUDED.country,
            updated_at = EXCLUDED.updated_at
    `;
  }

  private toEntity(row: UserRow): User {
    const props: UserProps = {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      phone: row.phone,
      status: row.status as UserStatus,
      role: row.role as UserRole,
      country: row.country,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return User.reconstitute(props);
  }
}
