import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

interface PaymentOtpEmailInput {
  to: string;
  code: string;
  expiresAt: Date;
}

const DEFAULT_GMAIL_USER = 'noreply@example.test';

@Injectable()
export class PaymentOtpEmailService {
  private readonly logger = new Logger(PaymentOtpEmailService.name);
  private transporter?: Transporter;

  async sendTransferOtp(input: PaymentOtpEmailInput): Promise<void> {
    const from = this.smtpFrom();
    await this.mailer().sendMail({
      from: this.formatFrom(from),
      to: input.to,
      subject: 'Your VaultBank transfer OTP',
      text: this.textBody(input),
      html: this.htmlBody(input),
    });
    this.logger.log(`Transfer OTP email sent to ${input.to}`);
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

  private textBody(input: PaymentOtpEmailInput): string {
    return [
      `Your VaultBank transfer OTP is ${input.code}.`,
      `It expires at ${input.expiresAt.toISOString()}.`,
      'Do not share this code with anyone.',
    ].join('\n');
  }

  private htmlBody(input: PaymentOtpEmailInput): string {
    return [
      '<p>Your VaultBank transfer OTP is:</p>',
      `<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${input.code}</p>`,
      `<p>This code expires at ${input.expiresAt.toISOString()}.</p>`,
      '<p>Do not share this code with anyone.</p>',
    ].join('');
  }

  private formatFrom(email: string): string {
    return `"VaultBank" <${email}>`;
  }

  private smtpUser(): string {
    return process.env.SMTP_USER?.trim() || DEFAULT_GMAIL_USER;
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
      throw new InternalServerErrorException(
        'SMTP_PASS is not configured. Set it to the Google app password.',
      );
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
