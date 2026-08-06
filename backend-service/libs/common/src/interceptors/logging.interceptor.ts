import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { EventBusService } from '@app/events';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { AuthenticatedRequest } from '../types/auth.types';
import { CorrelationContext } from '../correlation/correlation.context';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly events: EventBusService,
    private readonly metrics: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const correlationId = CorrelationContext.getId();

    response.once('finish', () => {
      const durationMs = Date.now() - startedAt;
      const path = sanitizePath(request.originalUrl || request.url);
      const auditEvent = {
        service: process.env.SERVICE_NAME ?? 'unknown-service',
        method: request.method,
        path,
        statusCode: response.statusCode,
        userId: request.user?.userId ?? null,
        ip: request.ip ?? 'unknown',
        durationMs,
        timestamp: new Date().toISOString(),
        correlationId,
      };
      this.metrics.recordHttpRequest({
        durationMs,
        method: request.method,
        path,
        statusCode: response.statusCode,
      });
      this.events.publish('audit.request', auditEvent);
      writeAuditLine(auditEvent);
    });

    return next.handle();
  }
}

function sanitizePath(value: string | undefined): string {
  const path = (value ?? '/').split('?')[0] || '/';
  return path
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ':uuid',
    )
    .replace(/\b\d{8,20}\b/g, ':number');
}

function writeAuditLine(event: {
  correlationId: string;
  durationMs: number;
  ip: string;
  method: string;
  path: string;
  service: string;
  statusCode: number;
  timestamp: string;
  userId: string | null;
}): void {
  process.stdout.write(
    `${JSON.stringify({
      ...event,
      event: 'audit.request',
      level: event.statusCode >= 500 ? 'error' : 'info',
    })}\n`,
  );
}
