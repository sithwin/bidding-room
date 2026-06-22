import { EventSubscriber } from '@carat-room/shared-events';
import { CreateInvoiceUseCase } from '../application/create-invoice-use-case';

interface AuctionClosedPayload {
  lotId: string;
  winnerUserId: string | null;
  highestAmount: number;
  currency: string;
  reserveMet: boolean;
}

export async function startAuctionClosedConsumer(
  subscriber: EventSubscriber,
  createInvoiceUseCase: CreateInvoiceUseCase,
): Promise<void> {
  await subscriber.subscribe<AuctionClosedPayload>(
    'payment.auction-closed',
    async (event: AuctionClosedPayload) => {
      if (!event.reserveMet || !event.winnerUserId) {
        return;
      }
      await createInvoiceUseCase.execute({
        lotId: event.lotId,
        winnerUserId: event.winnerUserId,
        amount: event.highestAmount,
        currency: event.currency,
      });
    },
  );
}
