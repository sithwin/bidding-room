import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuctionClosed } from '../../application/handlers/auction-closed.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;
const mockGetEmail = vi.fn().mockResolvedValue('winner@example.com');
const mockGetLotTitle = vi.fn().mockResolvedValue('Diamond Ring');

describe('handleAuctionClosed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_sendWonEmail_when_reserveIsMet', async () => {
    await handleAuctionClosed(
      { lotId: 'lot-1', highestBidId: 'bid-1', highestAmount: 1000, reserveMet: true, winnerUserId: 'user-1', closedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'AUCTION_CLOSED_WON', channel: 'EMAIL' })
    );
  });

  it('should_sendUnsoldEmail_when_reserveIsNotMet', async () => {
    await handleAuctionClosed(
      { lotId: 'lot-1', highestBidId: 'bid-1', highestAmount: 500, reserveMet: false, winnerUserId: 'user-1', closedAt: '2026-06-20T00:00:00Z' },
      mockUseCase, mockEmailSender, mockGetEmail, mockGetLotTitle, 'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'AUCTION_CLOSED_UNSOLD', channel: 'EMAIL' })
    );
  });
});
