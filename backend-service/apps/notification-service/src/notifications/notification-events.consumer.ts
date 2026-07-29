import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { BankingEventEnvelope } from '@app/events';
import { NotificationService, NotificationEvent } from './notification.service';

type QueueEvent =
  | BankingEventEnvelope<'user.registered'>
  | BankingEventEnvelope<'transaction.completed'>
  | BankingEventEnvelope<'payment.success'>
  | BankingEventEnvelope<'payment.failed'>;

@Injectable()
export class NotificationEventsConsumer {
  private readonly logger = new Logger(NotificationEventsConsumer.name);

  constructor(private readonly notifications: NotificationService) {}

  @RabbitSubscribe({
    queue: 'notification.queue',
    createQueueIfNotExists: false,
  })
  async handle(event: QueueEvent): Promise<Nack | void> {
    try {
      await this.notifications.handle(event as NotificationEvent);
    } catch (error: unknown) {
      this.logger.error(
        'Notification event handling failed',
        error instanceof Error ? error.stack : undefined,
      );
      return new Nack(true);
    }
  }
}
