import type { InvoiceExpiredPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderInvoiceExpiredEmail } from '../../infrastructure/email/templates/invoice-expired.js';

export async function handleInvoiceExpired(
  payload: InvoiceExpiredPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'INVOICE_EXPIRED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderInvoiceExpiredEmail({ lotTitle });
      await emailSender.sendEmail(email, 'Payment window closed', html);
    },
  });
}
