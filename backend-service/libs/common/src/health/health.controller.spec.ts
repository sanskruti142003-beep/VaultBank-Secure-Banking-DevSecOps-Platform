import {
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { EventBusService } from '@app/events';
import { CacheService } from '@app/redis';
import { VaultService } from '@app/vault';
import { HealthController } from './health.controller';

interface RelationCheckRow {
  relation: string | null;
}

interface DataSourceMock {
  query: jest.Mock<Promise<RelationCheckRow[]>, [string, unknown[]?]>;
}

describe('HealthController', () => {
  const originalEnv = process.env;
  let controller: HealthController;
  let database: jest.Mocked<Pick<TypeOrmHealthIndicator, 'pingCheck'>>;
  let cache: jest.Mocked<Pick<CacheService, 'isHealthy'>>;
  let events: jest.Mocked<Pick<EventBusService, 'isConnected'>>;
  let vault: jest.Mocked<Pick<VaultService, 'isHealthy'>>;
  let dataSource: DataSourceMock;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_URL: 'postgresql://runtime@example.invalid/user_db',
      HEALTH_DATABASE_ENABLED: 'true',
      SERVICE_NAME: 'auth-service',
    };

    const check = jest.fn(
      async (
        indicators: Array<() => Promise<HealthIndicatorResult>>,
      ): Promise<HealthCheckResult> => {
        const details: HealthCheckResult['details'] = {};
        for (const indicator of indicators) {
          Object.assign(details, await indicator());
        }
        return {
          status: 'ok',
          info: details,
          error: {},
          details,
        };
      },
    );

    const health = { check } as unknown as HealthCheckService;
    database = {
      pingCheck: jest.fn().mockResolvedValue({
        database: { status: 'up' },
      }),
    };
    cache = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };
    events = {
      isConnected: jest.fn().mockReturnValue(true),
    };
    vault = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };
    dataSource = {
      query: jest.fn<Promise<RelationCheckRow[]>, [string, unknown[]?]>(),
    };
    const moduleRef = {
      get: jest.fn().mockReturnValue(dataSource as unknown as DataSource),
    } as unknown as ModuleRef;

    controller = new HealthController(
      health,
      database as unknown as TypeOrmHealthIndicator,
      cache as unknown as CacheService,
      events as unknown as EventBusService,
      vault as unknown as VaultService,
      moduleRef,
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('keeps /health as process liveness only', () => {
    expect(controller.check()).toEqual(
      expect.objectContaining({
        service: 'auth-service',
        status: 'ok',
      }),
    );

    expect(database.pingCheck).not.toHaveBeenCalled();
    expect(cache.isHealthy).not.toHaveBeenCalled();
  });

  it('fails readiness when the auth schema has not been migrated', async () => {
    dataSource.query.mockResolvedValue([{ relation: null }]);

    await expect(controller.ready()).rejects.toThrow('public.users');

    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT to_regclass($1) AS relation',
      ['public.users'],
    );
  });

  it('passes readiness after the required auth table exists', async () => {
    dataSource.query.mockResolvedValue([{ relation: 'users' }]);

    await expect(controller.ready()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
        details: expect.objectContaining({
          schema: { status: 'up', relation: 'public.users' },
        }),
      }),
    );
  });

  it('does not require a database for notification-service readiness', async () => {
    process.env.SERVICE_NAME = 'notification-service';
    process.env.HEALTH_DATABASE_ENABLED = 'false';
    delete process.env.DB_URL;

    await expect(controller.ready()).resolves.toEqual(
      expect.objectContaining({
        status: 'ok',
      }),
    );

    expect(database.pingCheck).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
