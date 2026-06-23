import type { PostgresClient } from './postgres-client.js';
import type { NotificationRepository } from '../../domain/notification-repository.js';
import type { Notification } from '../../domain/notification.js';

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly sql: PostgresClient) {}

  async save(notification: Notification): Promise<void> {
    await this.sql`
      INSERT INTO notification_log
        (id, user_id, type, channel, status, error, sent_at, created_at)
      VALUES
        (
          ${notification.id},
          ${notification.userId},
          ${notification.type},
          ${notification.channel},
          ${notification.status},
          ${notification.error},
          ${notification.sentAt},
          ${notification.createdAt}
        )
    `;
  }
}
