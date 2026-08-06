import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventBusService } from '@app/events';
import { EventEmitter } from 'node:events';
import { throwError } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  it('records the final response status after exception filters finish', () => {
    const events = {
      publish: jest.fn(),
    } as unknown as EventBusService;
    const metrics = {
      recordHttpRequest: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new LoggingInterceptor(events, metrics);
    const response = Object.assign(new EventEmitter(), {
      statusCode: 201,
    });
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          method: 'POST',
          originalUrl: '/v1/auth/login',
          url: '/v1/auth/login',
          user: undefined,
        }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => throwError(() => new Error('boom')),
    } as CallHandler;

    interceptor.intercept(context, next).subscribe({
      error: () => undefined,
    });

    response.statusCode = 500;
    response.emit('finish');

    expect(events.publish).toHaveBeenCalledWith(
      'audit.request',
      expect.objectContaining({
        path: '/v1/auth/login',
        statusCode: 500,
      }),
    );
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
      }),
    );
  });
});
