import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleBidPlaced } from '../../application/handlers/bid-placed.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;
const mockGetEmail = vi.fn().mockResolvedValue('prev@example.com');
const mockGetLotTitle = vi.fn().mockResolvedValue('Test Lot');

describe('handleBidPlaced', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_notifyPreviousBidder_when_previousHighestBidderExists', async () => {
    await handleBidPlaced(
      { lotId: 'lot-1', bidId: 'bid-1', userId: 'user-2', amount: 500, previousHighestBidderId: 'user-1', placedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'BID_PLACED_OUTBID', channel: 'EMAIL' })
    );
  });

  it('should_doNothing_when_noPreviousHighestBidder', async () => {
    await handleBidPlaced(
      { lotId: 'lot-1', bidId: 'bid-1', userId: 'user-2', amount: 500, previousHighestBidderId: null, placedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).not.toHaveBeenCalled();
  });
});
