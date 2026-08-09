import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponseDto } from '../dto/api-response.dto';

interface HttpRequestLike {
  originalUrl?: string;
  url?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponseDto<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseDto<T> | T> {
    const request = context.switchToHttp().getRequest<HttpRequestLike>();

    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];

    const metricsEndpoint =
      path === '/metrics' || /^\/v\d+\/metrics$/.test(path);

    /*
     * Prometheus requires its native text exposition format.
     * Never wrap /metrics in the standard JSON API envelope.
     */
    if (metricsEndpoint) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
