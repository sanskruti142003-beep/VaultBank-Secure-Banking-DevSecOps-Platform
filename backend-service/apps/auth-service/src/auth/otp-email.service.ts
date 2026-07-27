import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { OtpPurpose } from '../users/entities';

interface OtpEmailInput {
  to: string;
  code: string;
  purpose: OtpPurpose;
  expiresAt: Date;
}

const DEFAULT_GMAIL_USER = 'patilsonalias002@gmail.com';

@Injectable()
export class OtpEmailService {
  private readonly logger = new Logger(OtpEmailService.name);
  private transporter?: Transporter;

  async sendOtp(input: OtpEmailInput): Promise<void> {
    const from = this.smtpFrom();
    await this.mailer().sendMail({
      from: this.formatFrom(from),
      to: input.to,
      subject: this.subject(input.purpose),
      text: this.textBody(input),
      html: this.htmlBody(input),
    });
    this.logger.log(`OTP email sent to ${input.to} for ${input.purpose}`);
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

  private subject(purpose: OtpPurpose): string {
    if (purpose === OtpPurpose.ADMIN_LOGIN) {
      return 'Your VaultBank admin sign-in OTP';
    }
    if (purpose === OtpPurpose.ACCOUNT_DELETE) {
      return 'Your VaultBank account deletion OTP';
    }
    if (purpose === OtpPurpose.RESET_PASSWORD) {
      return 'Your VaultBank password reset OTP';
    }
    return 'Your VaultBank verification OTP';
  }

  private textBody(input: OtpEmailInput): string {
    return [
      `Your VaultBank OTP is ${input.code}.`,
      `It expires at ${input.expiresAt.toISOString()}.`,
      'If you did not request this code, you can ignore this email.',
    ].join('\n');
  }

  private htmlBody(input: OtpEmailInput): string {
    return [
      '<p>Your VaultBank OTP is:</p>',
      `<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${input.code}</p>`,
      `<p>This code expires at ${input.expiresAt.toISOString()}.</p>`,
      '<p>If you did not request this code, you can ignore this email.</p>',
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
