import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../domain/user-repository';
import { TokenRepository } from '../infrastructure/db/postgres-token-repository';
import { OtpService } from './otp-service';
import { EventPublisher } from '@carat-room/shared-events';
import { ROUTING_KEYS, PhoneVerificationRequestedPayload } from '@carat-room/shared-types';

interface RequestPhoneOtpDto {
  userId: string;
  phone: string;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1000;

export class RequestPhoneOtpUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly otpService: OtpService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(dto: RequestPhoneOtpDto): Promise<void> {
    const user = await this.userRepo.findById(dto.userId);
    if (!user) throw new Error('User not found');

    const lockoutWindow = new Date(Date.now() - LOCKOUT_MS);
    const attempts = await this.tokenRepo.countRecentPhoneAttempts(dto.userId, lockoutWindow);
    if (attempts >= MAX_ATTEMPTS) {
      throw new Error('Too many OTP attempts. Please wait 15 minutes.');
    }

    user.requestPhoneVerification(dto.phone);
    await this.userRepo.save(user);

    const code = this.otpService.generate();
    await this.tokenRepo.saveVerificationToken({
      id: uuidv4(),
      userId: dto.userId,
      type: 'PHONE',
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const payload: PhoneVerificationRequestedPayload = {
      userId: dto.userId,
      phone: dto.phone,
      otpCode: code,
    };
    await this.publisher.publish(ROUTING_KEYS.USER_PHONE_VERIFICATION_REQUESTED, payload);
  }
}
