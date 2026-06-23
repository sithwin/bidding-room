import type { ItemDispatchedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderItemDispatchedEmail } from '../../infrastructure/email/templates/item-dispatched.js';

export async function handleItemDispatched(
  payload: ItemDispatchedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.userId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.userId,
    type: 'ITEM_DISPATCHED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderItemDispatchedEmail({
        lotTitle,
        trackingNumber: payload.trackingNumber,
        carrier: payload.carrier,
      });
      await emailSender.sendEmail(email, 'Your item has been dispatched', html);
    },
  });
}
