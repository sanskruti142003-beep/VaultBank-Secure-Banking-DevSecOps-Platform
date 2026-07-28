import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { EventsModule } from '@app/events';
import { RedisModule } from '@app/redis';
import { VaultModule } from '@app/vault';
import { HealthController } from './health/health.controller';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [RedisModule, EventsModule, VaultModule, TerminusModule],
  controllers: [HealthController, MetricsController],
  providers: [LoggingInterceptor, MetricsService, RolesGuard],
  exports: [
    RedisModule,
    EventsModule,
    VaultModule,
    LoggingInterceptor,
    MetricsService,
    RolesGuard,
  ],
})
export class InfrastructureModule {}
