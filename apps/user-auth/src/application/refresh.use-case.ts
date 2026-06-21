import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { TokenService } from './token-service';

interface RefreshDto {
  refreshToken: string;
}

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class RefreshUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: RefreshDto): Promise<RefreshResult> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const stored = await this.tokenRepo.findRefreshToken(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    await this.tokenRepo.revokeRefreshToken(stored.id);

    const user = await this.userRepo.findById(stored.userId);
    if (!user) throw new Error('User not found');

    const accessToken = this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      verificationStatus: user.status,
      role: user.role,
    });

    const newRefreshToken = this.tokenService.issueRefreshToken();
    const newHash = this.tokenService.hashRefreshToken(newRefreshToken);

    await this.tokenRepo.saveRefreshToken({
      id: uuidv4(),
      userId: user.id,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    return { accessToken, refreshToken: newRefreshToken };
  }
}
