export interface SmsSender {
  sendSms(to: string, body: string): Promise<void>;
}
