import {
  MessageHandlerErrorBehavior,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import type {
  BankingEventEnvelope,
  BankingRoutingKey,
  PaymentFailedPayload,
  PaymentSuccessPayload,
  TransactionCompletedPayload,
  UserRegisteredPayload,
} from './events';

@Injectable()
export class AuditQueueSubscriber {
  @RabbitSubscribe({
    queue: 'audit.queue',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(event: BankingEventEnvelope<BankingRoutingKey>): Promise<void> {
    await this.persistAuditEvent(event);
  }

  private async persistAuditEvent(
    _event: BankingEventEnvelope<BankingRoutingKey>,
  ): Promise<void> {
    // Audit service repository call goes here.
    void _event;
    await Promise.resolve();
  }
}

type NotificationEvent =
  | BankingEventEnvelope<'user.registered'>
  | BankingEventEnvelope<'transaction.completed'>
  | BankingEventEnvelope<'payment.success'>
  | BankingEventEnvelope<'payment.failed'>;

@Injectable()
export class NotificationQueueSubscriber {
  @RabbitSubscribe({
    queue: 'notification.queue',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(event: NotificationEvent): Promise<void> {
    const payload:
      | UserRegisteredPayload
      | TransactionCompletedPayload
      | PaymentSuccessPayload
      | PaymentFailedPayload = event.payload;
    await this.sendNotification(event.routingKey, payload);
  }

  private async sendNotification(
    _routingKey: string,
    _payload: object,
  ): Promise<void> {
    // Email/SMS provider call goes here.
    void _routingKey;
    void _payload;
    await Promise.resolve();
  }
}

@Injectable()
export class AccountQueueSubscriber {
  @RabbitSubscribe({
    queue: 'account.queue',
    createQueueIfNotExists: false,
    errorBehavior: MessageHandlerErrorBehavior.NACK,
  })
  async handle(
    event:
      | BankingEventEnvelope<'transaction.initiated'>
      | BankingEventEnvelope<'transaction.completed'>
      | BankingEventEnvelope<'transaction.failed'>
      | BankingEventEnvelope<'transaction.reversed'>,
  ): Promise<void> {
    await this.updateBalanceProjection(event);
  }

  private async updateBalanceProjection(_event: object): Promise<void> {
    // Account service balance projection update goes here.
    void _event;
    await Promise.resolve();
  }
}
