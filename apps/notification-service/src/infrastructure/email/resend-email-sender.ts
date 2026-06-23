import { Resend } from 'resend';
import type { EmailSender } from '../../application/email-sender.js';

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly fromAddress: string) {
    this.client = new Resend(apiKey);
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}
