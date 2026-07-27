import {
  MessageHandlerErrorBehavior,
  RabbitMQModule as GolevelupRabbitMQModule,
} from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

function requireRabbitMqUrl(): string {
  const url = process.env.RABBITMQ_URL;
  if (!url && process.env.NODE_ENV === 'test') {
    return 'amqp://127.0.0.1:1';
  }
  if (!url) {
    throw new Error('RABBITMQ_URL must be loaded from Vault before bootstrap');
  }
  return url;
}

@Global()
@Module({
  imports: [
    GolevelupRabbitMQModule.forRoot({
      uri: requireRabbitMqUrl(),
      prefetchCount: 10,
      defaultPublishOptions: {
        persistent: true,
        contentType: 'application/json',
      },
      defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
      connectionInitOptions: {
        wait: true,
        timeout: 10_000,
        reject: true,
      },
      registerHandlers: process.env.RABBITMQ_REGISTER_HANDLERS !== 'false',
      enableDirectReplyTo: false,
    }),
  ],
  providers: [EventBusService],
  exports: [GolevelupRabbitMQModule, EventBusService],
})
export class RabbitMQModule {}
