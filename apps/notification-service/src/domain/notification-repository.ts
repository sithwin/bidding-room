import type { Notification } from './notification.js';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
}
