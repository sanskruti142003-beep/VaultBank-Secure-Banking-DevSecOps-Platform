import {
  MessageHandlerErrorBehavior,
  RabbitMQModule,
} from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      useFactory: () => {
        const uri = process.env.RABBITMQ_URL;
        if (!uri) {
          throw new Error('RABBITMQ_URL must be loaded from Vault');
        }
        return {
          uri,
          prefetchCount: 10,
          defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
          connectionInitOptions: {
            wait: true,
            timeout: 10_000,
            reject: true,
          },
          enableDirectReplyTo: false,
        };
      },
    }),
  ],
  providers: [EventBusService],
  exports: [RabbitMQModule, EventBusService],
})
export class EventsModule {}
