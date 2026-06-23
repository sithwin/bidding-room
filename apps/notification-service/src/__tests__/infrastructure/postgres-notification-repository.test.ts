import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresNotificationRepository } from '../../infrastructure/db/postgres-notification-repository.js';
import type { PostgresClient } from '../../infrastructure/db/postgres-client.js';
import type { Notification } from '../../domain/notification.js';

const mockSql = vi.fn().mockResolvedValue([]);
const mockClient = mockSql as unknown as PostgresClient;

const buildNotification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'USER_REGISTERED',
  channel: 'EMAIL',
  status: 'SENT',
  error: null,
  sentAt: new Date('2026-06-20T10:00:00Z'),
  createdAt: new Date('2026-06-20T10:00:00Z'),
  ...overrides,
});

describe('PostgresNotificationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should_insertRow_when_saveIsCalledWithSentNotification', async () => {
    const repo = new PostgresNotificationRepository(mockClient);
    await repo.save(buildNotification());
    expect(mockSql).toHaveBeenCalledOnce();
  });

  it('should_insertRow_when_saveIsCalledWithFailedNotification', async () => {
    const repo = new PostgresNotificationRepository(mockClient);
    await repo.save(buildNotification({ status: 'FAILED', error: 'Resend API error', sentAt: null }));
    expect(mockSql).toHaveBeenCalledOnce();
  });
});
