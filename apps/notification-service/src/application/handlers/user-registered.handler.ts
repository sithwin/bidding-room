import type { UserRegisteredPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderUserRegisteredEmail } from '../../infrastructure/email/templates/user-registered.js';

export async function handleUserRegistered(
  payload: UserRegisteredPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  appBaseUrl: string
): Promise<void> {
  const verificationUrl = `${appBaseUrl}/account/verify-email?token=${payload.emailVerificationCode}&userId=${payload.userId}`;
await useCase.execute({
    userId: payload.userId,
    type: 'USER_REGISTERED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderUserRegisteredEmail({ verificationUrl });
      await emailSender.sendEmail(payload.email, 'Verify your email address', html);
    },
  });
}
