import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, UserRegisteredPayload } from '@carat-room/shared-types';

interface RegisterDto {
  email: string;
  password: string;
  country?: string;
}

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export class RegisterUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwordService: PasswordService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(dto: RegisterDto): Promise<void> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) throw new Error('Email already registered');

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = User.create({
      id: uuidv4(),
      email: dto.email,
      passwordHash,
      role: UserRole.BUYER,
      country: dto.country,
    });

    await this.userRepo.save(user);

    const tokenCode = uuidv4().replace(/-/g, '');
    await this.tokenRepo.saveVerificationToken({
      id: uuidv4(),
      userId: user.id,
      type: 'EMAIL',
      code: tokenCode,
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
    });

    const payload: UserRegisteredPayload = {
      userId: user.id,
      email: user.email,
      emailVerificationCode: tokenCode,
    };
    await this.publisher.publish(ROUTING_KEYS.USER_REGISTERED, payload);
  }
}
