import { Controller, Get } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import { DataSource } from 'typeorm';

const readinessTables: Record<string, string> = {
  'account-service': 'public.accounts',
  'auth-service': 'public.users',
  'payment-service': 'public.payment_orders',
  'transaction-service': 'public.transactions',
};

interface RelationCheckRow {
  relation: string | null;
}

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly cache: CacheService,
    private readonly events: EventBusService,
    private readonly vault: VaultService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Get('health')
  check(): {
    service: string;
    status: 'ok';
    uptimeSeconds: number;
  } {
    return {
      service: this.serviceName(),
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    const indicators = [
      () => this.status('configuration', () => this.hasRequiredConfig()),
      () => this.status('redis', () => this.cache.isHealthy()),
      () => this.status('rabbitmq', () => this.events.isConnected()),
      () => this.status('vault', () => this.vault.isHealthy()),
    ];

    if (process.env.HEALTH_DATABASE_ENABLED !== 'false') {
      indicators.unshift(() =>
        this.database.pingCheck('database', { timeout: 3000 }),
      );
      indicators.push(() => this.schemaIsReady());
    }

    return this.health.check(indicators);
  }

  private async schemaIsReady(): Promise<HealthIndicatorResult> {
    const relation = readinessTables[this.serviceName()];
    if (!relation) {
      return { schema: { status: 'up', checked: false } };
    }

    const dataSource = this.moduleRef.get(DataSource, { strict: false });
    const rows = await dataSource.query<RelationCheckRow[]>(
      'SELECT to_regclass($1) AS relation',
      [relation],
    );

    if (!rows[0]?.relation) {
      throw new Error(`${relation} is unavailable`);
    }

    return { schema: { status: 'up', relation } };
  }

  private hasRequiredConfig(): boolean {
    if (!this.serviceName()) {
      return false;
    }
    if (process.env.HEALTH_DATABASE_ENABLED === 'false') {
      return true;
    }
    return Boolean(process.env.DB_URL);
  }

  private serviceName(): string {
    return process.env.SERVICE_NAME ?? 'unknown-service';
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
