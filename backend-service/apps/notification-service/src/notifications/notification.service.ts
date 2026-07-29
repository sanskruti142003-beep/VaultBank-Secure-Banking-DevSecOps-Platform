import { Injectable, Logger } from '@nestjs/common';
import { BankingEventEnvelope } from '@app/events';
import { NotificationMailerService } from './notification-mailer.service';

export type NotificationEvent =
  | BankingEventEnvelope<'user.registered'>
  | BankingEventEnvelope<'transaction.completed'>
  | BankingEventEnvelope<'payment.success'>
  | BankingEventEnvelope<'payment.failed'>;

interface NotificationMessage {
  html: string;
  recipientEmail?: string;
  subject: string;
  text: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly mailer: NotificationMailerService) {}

  async handle(event: NotificationEvent): Promise<void> {
    const message = this.messageFor(event);
    if (!message.recipientEmail) {
      this.writeNotificationLine(event, 'skipped', {
        reason: 'recipient_email_missing',
      });
      this.logger.warn(
        `Skipped ${event.routingKey} notification because no recipient email was present`,
      );
      return;
    }

    await this.mailer.send({
      to: message.recipientEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.writeNotificationLine(event, 'sent', {
      recipientEmail: message.recipientEmail,
    });
  }

  private messageFor(event: NotificationEvent): NotificationMessage {
    switch (event.routingKey) {
      case 'user.registered':
        return {
          recipientEmail: event.payload.email,
          subject: 'Welcome to VaultBank',
          text: [
            `Hello ${event.payload.fullName},`,
            '',
            'Your VaultBank account was created successfully.',
          ].join('\n'),
          html: [
            `<p>Hello ${this.escapeHtml(event.payload.fullName)},</p>`,
            '<p>Your VaultBank account was created successfully.</p>',
          ].join(''),
        };
      case 'transaction.completed':
        return {
          subject: 'VaultBank transaction completed',
          text: `Transaction ${event.payload.reference} completed for ${event.payload.amount} ${event.payload.currency}.`,
          html: `<p>Transaction ${this.escapeHtml(event.payload.reference)} completed.</p>`,
        };
      case 'payment.success':
        return {
          subject: 'VaultBank payment successful',
          text: `Payment ${event.payload.paymentId} succeeded for ${event.payload.amount} ${event.payload.currency}.`,
          html: `<p>Payment ${this.escapeHtml(event.payload.paymentId)} succeeded.</p>`,
        };
      case 'payment.failed':
        return {
          subject: 'VaultBank payment failed',
          text: `Payment ${event.payload.paymentId} failed. Reason: ${event.payload.reason}.`,
          html: `<p>Payment ${this.escapeHtml(event.payload.paymentId)} failed.</p>`,
        };
    }
  }

  private writeNotificationLine(
    event: NotificationEvent,
    status: string,
    details: Record<string, string>,
  ): void {
    process.stdout.write(
      `${JSON.stringify({
        event: 'notification.delivery',
        level: status === 'sent' ? 'info' : 'warn',
        routingKey: event.routingKey,
        eventId: event.id,
        correlationId: event.correlationId,
        status,
        ...details,
        timestamp: new Date().toISOString(),
      })}\n`,
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
