import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { EventBusService } from '@app/events';
import { CacheService } from '@app/redis';
import { VaultService } from '@app/vault';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly cache: CacheService,
    private readonly events: EventBusService,
    private readonly vault: VaultService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.database.pingCheck('database', { timeout: 3000 }),
      () => this.status('redis', () => this.cache.isHealthy()),
      () => this.status('rabbitmq', () => this.events.isConnected()),
      () => this.status('vault', () => this.vault.isHealthy()),
    ]);
  }

  private async status(
    name: string,
    probe: () => Promise<boolean> | boolean,
  ): Promise<HealthIndicatorResult> {
    const healthy = await probe();
    if (!healthy) {
      throw new Error(`${name} is unavailable`);
    }
    return { [name]: { status: 'up' } };
  }
}
