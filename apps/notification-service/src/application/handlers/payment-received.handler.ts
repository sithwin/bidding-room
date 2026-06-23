import type { PaymentReceivedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderPaymentReceivedEmail } from '../../infrastructure/email/templates/payment-received.js';

export async function handlePaymentReceived(
  payload: PaymentReceivedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'PAYMENT_RECEIVED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderPaymentReceivedEmail({
        lotTitle,
        amount: `$${payload.amount}`,
        currency: payload.currency,
        fulfilmentUrl: `${appBaseUrl}/account/fulfilments`,
      });
      await emailSender.sendEmail(email, 'Payment confirmed', html);
    },
  });
}
