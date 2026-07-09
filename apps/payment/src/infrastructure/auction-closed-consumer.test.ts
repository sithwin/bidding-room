import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuctionClosedPayload } from '@carat-room/shared-types';
import { startAuctionClosedConsumer } from './auction-closed-consumer';
import { CreateInvoiceUseCase } from '../application/create-invoice-use-case';

type Handler = (event: AuctionClosedPayload) => Promise<void>;

describe('startAuctionClosedConsumer', () => {
  let capturedHandler: Handler;
  const mockSubscriber = {
    subscribe: vi.fn(async (_queue: string, handler: Handler, _routingKey: string) => {
      capturedHandler = handler;
    }),
  };
  const mockCreateInvoiceUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as CreateInvoiceUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_createInvoiceWithDefaultCurrencyAUD_when_reserveMetAndWinnerPresent', async () => {
    await startAuctionClosedConsumer(mockSubscriber as never, mockCreateInvoiceUseCase);

    await capturedHandler({
      lotId: 'lot-1',
      highestBidId: 'bid-1',
      highestAmount: 600,
      reserveMet: true,
      winnerUserId: 'user-1',
      closedAt: '2026-06-20T12:00:00Z',
    });

    expect(mockCreateInvoiceUseCase.execute).toHaveBeenCalledWith({
      lotId: 'lot-1',
      winnerUserId: 'user-1',
      amount: 600,
      currency: 'AUD',
    });
  });

  it('should_notCreateInvoice_when_reserveNotMet', async () => {
    await startAuctionClosedConsumer(mockSubscriber as never, mockCreateInvoiceUseCase);

    await capturedHandler({
      lotId: 'lot-1',
      highestBidId: 'bid-1',
      highestAmount: 300,
      reserveMet: false,
      winnerUserId: null,
      closedAt: '2026-06-20T12:00:00Z',
    });

    expect(mockCreateInvoiceUseCase.execute).not.toHaveBeenCalled();
  });

  it('should_notCreateInvoice_when_highestAmountIsNull', async () => {
    await startAuctionClosedConsumer(mockSubscriber as never, mockCreateInvoiceUseCase);

    await capturedHandler({
      lotId: 'lot-1',
      highestBidId: null,
      highestAmount: null,
      reserveMet: false,
      winnerUserId: null,
      closedAt: '2026-06-20T12:00:00Z',
    });

    expect(mockCreateInvoiceUseCase.execute).not.toHaveBeenCalled();
  });
});
