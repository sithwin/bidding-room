export interface ExpiryScheduler {
  scheduleExpiry(invoiceId: string, dueAt: Date): Promise<void>;
  cancelExpiry(invoiceId: string): Promise<void>;
}
