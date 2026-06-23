import type { ItemCollectedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderItemCollectedEmail } from '../../infrastructure/email/templates/item-collected.js';

export async function handleItemCollected(
  payload: ItemCollectedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>
): Promise<void> {
  const [email, lotTitle] = await Promise.all([getUserEmail(payload.userId), getLotTitle(payload.lotId)]);
  await useCase.execute({
    userId: payload.userId,
    type: 'ITEM_COLLECTED',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderItemCollectedEmail({ lotTitle });
      await emailSender.sendEmail(email, 'Collection confirmed', html);
    },
  });
}
