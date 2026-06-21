import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { TokenService } from './token-service';

interface LogoutDto {
  refreshToken: string;
}

export class LogoutUseCase {
  constructor(
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: LogoutDto): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const stored = await this.tokenRepo.findRefreshToken(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.tokenRepo.revokeRefreshToken(stored.id);
    }
  }
}
