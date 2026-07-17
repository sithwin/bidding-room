import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../domain/user';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../domain/token-repository';
import { TokenService } from './token-service';
import { GoogleIdentityProvider } from './google-identity-provider';

interface GoogleAuthDto {
  code: string;
  codeVerifier: string;
}

interface GoogleAuthResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class GoogleAuthUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly tokenService: TokenService,
    private readonly googleIdentityProvider: GoogleIdentityProvider,
  ) {}

  async execute(dto: GoogleAuthDto): Promise<GoogleAuthResult> {
    const profile = await this.googleIdentityProvider.exchangeCodeForProfile(dto.code, dto.codeVerifier);

    if (!profile.emailVerified) {
      throw new Error('Google email not verified');
    }

    let user = await this.userRepo.findByGoogleId(profile.providerId);

    if (!user) {
      const existingByEmail = await this.userRepo.findByEmail(profile.email);
      if (existingByEmail) {
        existingByEmail.linkGoogleAccount(profile.providerId);
        await this.userRepo.save(existingByEmail);
        user = existingByEmail;
      } else {
        user = User.createFromGoogle({
          id: uuidv4(),
          email: profile.email,
          googleId: profile.providerId,
          role: UserRole.BUYER,
        });
        await this.userRepo.save(user);
      }
    }

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
