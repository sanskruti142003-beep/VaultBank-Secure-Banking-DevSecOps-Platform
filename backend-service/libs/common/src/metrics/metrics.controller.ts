import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  scrape(@Res() response: Response): void {
    response.setHeader(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );

    response.status(200).send(this.metrics.scrape());
  }
}
