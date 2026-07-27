import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { EventBusService } from '@app/events';
import { Observable, finalize } from 'rxjs';
import { AuthenticatedRequest } from '../types/auth.types';
import { CorrelationContext } from '../correlation/correlation.context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly events: EventBusService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();
    return next.handle().pipe(
      finalize(() => {
        this.events.publish('audit.request', {
          service: process.env.SERVICE_NAME ?? 'unknown-service',
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          userId: request.user?.userId ?? null,
          ip: request.ip ?? 'unknown',
          durationMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
          correlationId: CorrelationContext.getId(),
        });
      }),
    );
  }
}
