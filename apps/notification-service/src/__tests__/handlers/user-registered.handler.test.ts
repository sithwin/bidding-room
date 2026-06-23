import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUserRegistered } from '../../application/handlers/user-registered.handler.js';
import type { LogNotificationUseCase } from '../../application/log-notification.use-case.js';
import type { EmailSender } from '../../application/email-sender.js';

const mockUseCase = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as LogNotificationUseCase;
const mockEmailSender = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;

describe('handleUserRegistered', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_callUseCaseWithEmailChannel_when_userRegisteredPayloadReceived', async () => {
    await handleUserRegistered(
      { userId: 'user-1', email: 'test@example.com', createdAt: '2026-06-20T00:00:00Z' },
      mockUseCase,
      mockEmailSender,
      'https://app.example.com'
    );
    expect(mockUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'USER_REGISTERED', channel: 'EMAIL' })
    );
  });
});
