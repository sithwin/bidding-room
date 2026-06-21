import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { PasswordService } from './password-service';
import { TokenService } from './token-service';

interface LoginDto {
  email: string;
  password: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class LoginUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(dto.email);
    if (!user) throw new Error('Invalid credentials');

    const valid = await this.passwordService.verify(dto.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    const accessToken = this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      verificationStatus: user.status,
      role: user.role,
    });

    const refreshToken = this.tokenService.issueRefreshToken();
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);

    await this.tokenRepo.saveRefreshToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { accessToken, refreshToken };
  }
}
