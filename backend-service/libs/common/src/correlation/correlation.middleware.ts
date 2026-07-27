import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { CorrelationContext } from './correlation.context';
import { AuthenticatedRequest } from '../types/auth.types';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const header = request.header('x-correlation-id');
    CorrelationContext.run(header, () => {
      const id = CorrelationContext.getId();
      request.correlationId = id;
      response.setHeader('x-correlation-id', id);
      next();
    });
  }
}
