import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

function createContext(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: url,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor<string>();

  it('does not wrap Prometheus metrics responses', async () => {
    const metrics =
      '# HELP vaultbank_service_info Service identity\n' +
      '# TYPE vaultbank_service_info gauge\n' +
      'vaultbank_service_info{service="auth-service"} 1\n';

    const next: CallHandler<string> = {
      handle: () => of(metrics),
    };

    const result = await lastValueFrom(
      interceptor.intercept(createContext('/v1/metrics'), next),
    );

    expect(result).toBe(metrics);
  });

  it('continues wrapping normal API responses', async () => {
    const next: CallHandler<string> = {
      handle: () => of('ok'),
    };

    const result = await lastValueFrom(
      interceptor.intercept(createContext('/v1/example'), next),
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: 'ok',
      }),
    );
  });

  it('supports versioned metrics paths with query strings', async () => {
    const metrics = 'test_metric 1\n';

    const next: CallHandler<string> = {
      handle: () => of(metrics),
    };

    const result = await lastValueFrom(
      interceptor.intercept(createContext('/v1/metrics?test=1'), next),
    );

    expect(result).toBe(metrics);
  });
});
