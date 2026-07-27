import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from './rabbitmq';
import { RedisModule } from './redis';
import { VaultModule } from './vault';
import { InfrastructureHealthService } from './infrastructure-health.service';
import { InfrastructureHealthController } from './infrastructure-health.controller';

@Global()
@Module({
  imports: [RedisModule, RabbitMQModule, VaultModule],
  controllers: [InfrastructureHealthController],
  providers: [InfrastructureHealthService],
  exports: [
    RedisModule,
    RabbitMQModule,
    VaultModule,
    InfrastructureHealthService,
  ],
})
export class InfrastructureModule {}

export { InfrastructureModule as SharedInfrastructureModule };
