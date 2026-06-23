import type { AuctionClosedPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderAuctionClosedWonEmail } from '../../infrastructure/email/templates/auction-closed-won.js';
import { renderAuctionClosedUnsoldEmail } from '../../infrastructure/email/templates/auction-closed-unsold.js';

export async function handleAuctionClosed(
  payload: AuctionClosedPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const lotTitle = await getLotTitle(payload.lotId);

  if (payload.reserveMet && payload.winnerUserId && payload.highestAmount) {
    const email = await getUserEmail(payload.winnerUserId);
    await useCase.execute({
      userId: payload.winnerUserId,
      type: 'AUCTION_CLOSED_WON',
      channel: 'EMAIL',
      send: async () => {
        const html = await renderAuctionClosedWonEmail({
          lotTitle,
          winningBid: `$${payload.highestAmount}`,
          invoiceUrl: `${appBaseUrl}/account/dashboard`,
          dueDate: '3 days from now',
        });
        await emailSender.sendEmail(email, `You won ${lotTitle}!`, html);
      },
    });
    return;
  }

  if (!payload.reserveMet && payload.winnerUserId) {
    const email = await getUserEmail(payload.winnerUserId);
    await useCase.execute({
      userId: payload.winnerUserId,
      type: 'AUCTION_CLOSED_UNSOLD',
      channel: 'EMAIL',
      send: async () => {
        const html = await renderAuctionClosedUnsoldEmail({ lotTitle });
        await emailSender.sendEmail(email, `Auction ended: ${lotTitle}`, html);
      },
    });
  }
}
