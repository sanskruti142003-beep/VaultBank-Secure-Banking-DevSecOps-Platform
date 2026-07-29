import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

interface EmailMessage {
  html: string;
  subject: string;
  text: string;
  to: string;
}

@Injectable()
export class NotificationMailerService {
  private readonly logger = new Logger(NotificationMailerService.name);
  private transporter?: Transporter;

  async send(message: EmailMessage): Promise<void> {
    await this.mailer().sendMail({
      from: this.formatFrom(this.smtpFrom()),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(`Notification email sent to ${message.to}`);
  }

  private mailer(): Transporter {
    if (!this.transporter) {
      const port = this.smtpPort();
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
        port,
        secure: this.envBoolean('SMTP_SECURE', port === 465),
        auth: {
          user: this.smtpUser(),
          pass: this.smtpPassword(),
        },
      });
    }
    return this.transporter;
  }

  private formatFrom(email: string): string {
    return `"VaultBank" <${email}>`;
  }

  private smtpUser(): string {
    const value = process.env.SMTP_USER?.trim();
    if (!value) {
      throw new InternalServerErrorException('SMTP_USER is not configured');
    }
    return value;
  }

  private smtpFrom(): string {
    return process.env.SMTP_FROM?.trim() || this.smtpUser();
  }

  private smtpPassword(): string {
    const value =
      process.env.SMTP_PASS?.trim() ||
      process.env.GOOGLE_APP_PASSWORD?.trim() ||
      process.env.GMAIL_APP_PASSWORD?.trim();
    if (!value) {
      throw new InternalServerErrorException('SMTP_PASS is not configured');
    }
    return value;
  }

  private smtpPort(): number {
    const raw = process.env.SMTP_PORT?.trim();
    if (!raw) {
      return 465;
    }
    const port = Number.parseInt(raw, 10);
    if (!Number.isInteger(port) || port <= 0) {
      throw new InternalServerErrorException('SMTP_PORT is invalid');
    }
    return port;
  }

  private envBoolean(name: string, fallback: boolean): boolean {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }
    return ['1', 'true', 'yes'].includes(raw);
  }
}
