import type { InvoiceCreatedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderInvoiceCreatedEmail } from '../../infrastructure/email/templates/invoice-created.js';

export async function handleInvoiceCreated(
  payload: InvoiceCreatedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.winnerUserId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.winnerUserId,
    type: 'INVOICE_CREATED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderInvoiceCreatedEmail({
        lotTitle,
        amount: `$${payload.amount}`,
        currency: payload.currency,
        dueDate: new Date(payload.dueAt).toLocaleDateString('en-AU'),
        checkoutUrl: `${appBaseUrl}/account/invoices/${payload.invoiceId}`,
      });
      await emailSender.sendEmail(email, `Invoice: ${lotTitle}`, html);
    },
  });
}
