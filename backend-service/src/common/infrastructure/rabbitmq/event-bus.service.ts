import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BankingEventEnvelope,
  BankingEventPayloadMap,
  BankingRoutingKey,
} from './events';

@Injectable()
export class EventBusService {
  constructor(private readonly connection: AmqpConnection) {}

  async publish<K extends BankingRoutingKey>(
    routingKey: K,
    payload: BankingEventPayloadMap[K],
    options: { source?: string; correlationId?: string } = {},
  ): Promise<BankingEventEnvelope<K>> {
    const event: BankingEventEnvelope<K> = {
      id: randomUUID(),
      routingKey,
      source: options.source ?? process.env.SERVICE_NAME ?? 'unknown-service',
      occurredAt: new Date().toISOString(),
      ...(options.correlationId
        ? { correlationId: options.correlationId }
        : {}),
      payload,
    };

    await this.connection.publish('banking.events', routingKey, event, {
      persistent: true,
      contentType: 'application/json',
      messageId: event.id,
      correlationId: event.correlationId,
      timestamp: Date.now(),
      type: routingKey,
    });

    return event;
  }

  isConnected(): boolean {
    return this.connection.connected;
  }

  async waitUntilConnected(timeoutMs = 10_000): Promise<void> {
    const startedAt = Date.now();
    while (!this.connection.connected) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error('RabbitMQ did not become ready before timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
