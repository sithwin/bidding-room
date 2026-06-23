import twilio from 'twilio';
import type { SmsSender } from '../../application/sms-sender.js';

export class TwilioSmsSender implements SmsSender {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly fromNumber: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendSms(to: string, body: string): Promise<void> {
    await this.client.messages.create({ from: this.fromNumber, to, body });
  }
}
