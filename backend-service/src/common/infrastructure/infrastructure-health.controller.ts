import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  InfrastructureHealth,
  InfrastructureHealthService,
} from './infrastructure-health.service';

@Controller('health/infrastructure')
export class InfrastructureHealthController {
  constructor(private readonly health: InfrastructureHealthService) {}

  @Get()
  async check(): Promise<InfrastructureHealth> {
    const result = await this.health.check();
    if (!result.healthy) {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
