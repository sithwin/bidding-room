import type { PhoneVerificationRequestedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { SmsSender } from '../sms-sender.js';

export async function handlePhoneVerification(
  payload: PhoneVerificationRequestedPayload,
  useCase: LogNotificationUseCase,
  smsSender: SmsSender
): Promise<void> {
  await useCase.execute({
    userId: payload.userId,
    type: 'PHONE_VERIFICATION_REQUESTED',
    channel: 'SMS',
    send: async () => {
      await smsSender.sendSms(
        payload.phone,
        `Your Carat Room verification code is: ${payload.otpCode}. It expires in 10 minutes.`
      );
    },
  });
}
