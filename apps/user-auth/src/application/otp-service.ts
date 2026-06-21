import { randomInt } from 'crypto';

export class OtpService {
  generate(): string {
    return String(randomInt(100000, 999999));
  }
}
