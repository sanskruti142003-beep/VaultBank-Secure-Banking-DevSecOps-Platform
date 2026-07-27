import {
  MessageHandlerErrorBehavior,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import type { ConsumeMessage } from 'amqplib';

@Injectable()
export class DeadLetterHandlerService {
  private readonly logger = new Logger(DeadLetterHandlerService.name);

  @RabbitSubscribe({
    queue: 'audit.queue.dlq',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  handleAudit(message: object, raw: ConsumeMessage): void {
    this.record('audit.queue.dlq', message, raw);
  }

  @RabbitSubscribe({
    queue: 'notification.queue.dlq',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  handleNotification(message: object, raw: ConsumeMessage): void {
    this.record('notification.queue.dlq', message, raw);
  }

  @RabbitSubscribe({
    queue: 'account.queue.dlq',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  handleAccount(message: object, raw: ConsumeMessage): void {
    this.record('account.queue.dlq', message, raw);
  }

  private record(queue: string, message: object, raw: ConsumeMessage): void {
    const headers = raw.properties.headers;
    this.logger.error({
      queue,
      messageId: raw.properties.messageId as unknown,
      routingKey: raw.fields.routingKey,
      deaths: headers?.['x-death'],
      message,
    });
  }
}
