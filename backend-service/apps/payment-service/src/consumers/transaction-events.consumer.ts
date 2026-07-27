import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BankingEventEnvelope } from '@app/events';
import { PaymentsService } from '../payments/payments.service';

type TransactionEvent =
  | BankingEventEnvelope<'transaction.completed'>
  | BankingEventEnvelope<'transaction.failed'>;

@Injectable()
export class TransactionEventsConsumer {
  private readonly logger = new Logger(TransactionEventsConsumer.name);

  constructor(private readonly payments: PaymentsService) {}

  @RabbitSubscribe({
    queue: 'payment.queue',
    createQueueIfNotExists: false,
  })
  async handle(event: TransactionEvent): Promise<Nack | void> {
    try {
      if (event.routingKey === 'transaction.completed') {
        const payload = event.payload;
        await this.payments.handleTransactionCompleted(payload.txnId);
      } else {
        const payload = event.payload;
        await this.payments.handleTransactionFailed(
          payload.txnId,
          payload.reason,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        'Transaction event handling failed',
        error instanceof Error ? error.stack : undefined,
      );
      return error instanceof NotFoundException
        ? new Nack(false)
        : new Nack(true);
    }
  }
}
