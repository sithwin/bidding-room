export interface EmailSender {
  sendEmail(to: string, subject: string, html: string): Promise<void>;
}
