export interface TimerScheduler {
  scheduleStart(lotId: string, startAt: Date): Promise<void>;
  scheduleClose(lotId: string, endAt: Date): Promise<void>;
  rescheduleClose(lotId: string, newEndAt: Date): Promise<void>;
  scheduleClosingSoon(lotId: string, fireAt: Date): Promise<void>;
}
