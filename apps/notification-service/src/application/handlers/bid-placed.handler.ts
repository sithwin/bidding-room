import type { BidPlacedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderBidPlacedEmail } from '../../infrastructure/email/templates/bid-placed.js';

export async function handleBidPlaced(
  payload: BidPlacedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  if (!payload.previousHighestBidderId) return;

  const [email, lotTitle] = await Promise.all([
    getUserEmail(payload.previousHighestBidderId),
    getLotTitle(payload.lotId),
  ]);
  await useCase.execute({
    userId: payload.previousHighestBidderId,
    type: 'BID_PLACED_OUTBID',
    channel: 'EMAIL',
    send: async () => {
      const html = await renderBidPlacedEmail({
        lotTitle,
        currentBid: `$${payload.amount}`,
        lotUrl: `${appBaseUrl}/auctions/${payload.lotId}`,
      });
      await emailSender.sendEmail(email, `You've been outbid on ${lotTitle}`, html);
    },
  });
}
