import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BankingEventEnvelope,
  BankingEventMap,
  BankingRoutingKey,
} from './event-payloads';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private readonly connection: AmqpConnection) {}

  publish<K extends BankingRoutingKey>(
    routingKey: K,
    payload: BankingEventMap[K],
    correlationId = randomUUID(),
  ): BankingEventEnvelope<K> {
    const envelope: BankingEventEnvelope<K> = {
      id: randomUUID(),
      routingKey,
      source: process.env.SERVICE_NAME ?? 'unknown-service',
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };

    void this.connection
      .publish('banking.events', routingKey, envelope, {
        persistent: true,
        contentType: 'application/json',
        messageId: envelope.id,
        correlationId,
        type: routingKey,
        timestamp: Date.now(),
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to publish ${routingKey}: ${message}`);
      });

    return envelope;
  }

  isConnected(): boolean {
    return this.connection.connected;
  }
}
