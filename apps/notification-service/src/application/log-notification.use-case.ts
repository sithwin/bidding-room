import { randomUUID } from 'crypto';
import type { NotificationRepository } from '../domain/notification-repository.js';
import type { NotificationChannel, NotificationType } from '../domain/notification.js';

export interface LogNotificationParams {
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  send: () => Promise<void>;
}

export class LogNotificationUseCase {
  constructor(private readonly repo: NotificationRepository) {}

  async execute(params: LogNotificationParams): Promise<void> {
    const now = new Date();
    try {
      await params.send();
      await this.repo.save({
        id: randomUUID(),
        userId: params.userId,
        type: params.type,
        channel: params.channel,
        status: 'SENT',
        error: null,
        sentAt: new Date(),
        createdAt: now,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.repo.save({
        id: randomUUID(),
        userId: params.userId,
        type: params.type,
        channel: params.channel,
        status: 'FAILED',
        error,
        sentAt: null,
        createdAt: now,
      });
    }
  }
}
