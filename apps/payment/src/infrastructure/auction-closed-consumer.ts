import { EventSubscriber } from '@carat-room/shared-events';
import type { AuctionClosedPayload } from '@carat-room/shared-types';
import { CreateInvoiceUseCase } from '../application/create-invoice-use-case';

const DEFAULT_CURRENCY = process.env['DEFAULT_CURRENCY'] ?? 'AUD';

export async function startAuctionClosedConsumer(
  subscriber: EventSubscriber,
  createInvoiceUseCase: CreateInvoiceUseCase,
): Promise<void> {
  await subscriber.subscribe<AuctionClosedPayload>(
    'payment.auction.closed',
    async (event: AuctionClosedPayload) => {
      if (!event.reserveMet || !event.winnerUserId || event.highestAmount == null) {
        return;
      }
      await createInvoiceUseCase.execute({
        lotId: event.lotId,
        winnerUserId: event.winnerUserId,
        amount: event.highestAmount,
        currency: DEFAULT_CURRENCY,
      });
    },
    'auction.closed',
  );
}
