import type { AuctionClosingSoonPayload } from '@carat-room/shared-types';
import type { LogNotificationUseCase } from '../log-notification.use-case.js';
import type { EmailSender } from '../email-sender.js';
import { renderAuctionClosingSoonEmail } from '../../infrastructure/email/templates/auction-closing-soon.js';

export async function handleAuctionClosingSoon(
  payload: AuctionClosingSoonPayload,
  useCase: LogNotificationUseCase,
  emailSender: EmailSender,
  getUserEmail: (userId: string) => Promise<string>,
  getLotTitle: (lotId: string) => Promise<string>,
  getCurrentBid: (lotId: string) => Promise<string>,
  appBaseUrl: string
): Promise<void> {
  const [lotTitle, currentBid] = await Promise.all([
    getLotTitle(payload.lotId),
    getCurrentBid(payload.lotId),
  ]);
  await Promise.all(
    payload.activeBidderIds.map(async (bidderId) => {
      const email = await getUserEmail(bidderId);
      await useCase.execute({
        userId: bidderId,
        type: 'AUCTION_CLOSING_SOON',
        channel: 'EMAIL',
        send: async () => {
          const html = await renderAuctionClosingSoonEmail({
            lotTitle,
            closingAt: new Date(payload.endAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' }),
            currentBid,
            lotUrl: `${appBaseUrl}/auctions/${payload.lotId}`,
          });
          await emailSender.sendEmail(email, `${lotTitle} is closing soon`, html);
        },
      });
    })
  );
}
