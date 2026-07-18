import { Db } from './db';
import { AuthProvider, User, UserProps, UserRole, UserStatus } from '../../domain/user';
import { UserRepository, UserListFilter } from '../../domain/user-repository';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  auth_provider: string;
  phone: string | null;
  status: string;
  role: string;
  country: string | null;
  identity_document_key: string | null;
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

  async findByGoogleId(googleId: string): Promise<User | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE google_id = ${googleId}`;
    return row ? this.toEntity(row) : null;
  }

  async findAll(filter: UserListFilter): Promise<User[]> {
    const search = filter.search ? `%${filter.search}%` : null;
    const rows = await this.db<UserRow[]>`
      SELECT * FROM users
      WHERE (${filter.status ?? null}::text IS NULL OR status = ${filter.status ?? null})
        AND (${search}::text IS NULL OR email ILIKE ${search})
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return rows.map((row) => this.toEntity(row));
  }

  async save(user: User): Promise<void> {
    const props = user.toProps();
    await this.db`
      INSERT INTO users (id, email, password_hash, google_id, auth_provider, phone, status, role, country, identity_document_key, created_at, updated_at)
      VALUES (${props.id}, ${props.email}, ${props.passwordHash}, ${props.googleId}, ${props.authProvider}, ${props.phone}, ${props.status}, ${props.role}, ${props.country}, ${props.identityDocumentKey}, ${props.createdAt}, ${props.updatedAt})
      -- email is intentionally immutable after creation — every other field is updated
      ON CONFLICT (id) DO UPDATE
        SET password_hash          = EXCLUDED.password_hash,
            google_id              = EXCLUDED.google_id,
            auth_provider          = EXCLUDED.auth_provider,
            phone                  = EXCLUDED.phone,
            status                 = EXCLUDED.status,
            country                = EXCLUDED.country,
            identity_document_key  = EXCLUDED.identity_document_key,
            updated_at             = EXCLUDED.updated_at
    `;
  }

  private toEntity(row: UserRow): User {
    const props: UserProps = {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      googleId: row.google_id,
      authProvider: row.auth_provider as AuthProvider,
      phone: row.phone,
      status: row.status as UserStatus,
      role: row.role as UserRole,
      country: row.country,
      identityDocumentKey: row.identity_document_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return User.reconstitute(props);
  }
}
