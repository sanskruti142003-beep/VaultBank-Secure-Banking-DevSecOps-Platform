import { Injectable } from '@nestjs/common';
import { EventBusService } from './rabbitmq';
import { CacheService } from './redis';
import { VaultService } from './vault';

export interface InfrastructureHealth {
  healthy: boolean;
  services: {
    redis: boolean;
    rabbitmq: boolean;
    vault: boolean;
  };
}

@Injectable()
export class InfrastructureHealthService {
  constructor(
    private readonly cache: CacheService,
    private readonly eventBus: EventBusService,
    private readonly vault: VaultService,
  ) {}

  async check(): Promise<InfrastructureHealth> {
    const [redis, vault] = await Promise.all([
      this.cache.isHealthy(),
      this.vault.isHealthy(),
    ]);
    const rabbitmq = this.eventBus.isConnected();

    return {
      healthy: redis && rabbitmq && vault,
      services: { redis, rabbitmq, vault },
    };
  }
}
