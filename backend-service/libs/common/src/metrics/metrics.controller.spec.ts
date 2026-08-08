import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import type { Response } from 'express';
import { TransformInterceptor } from '../interceptors/transform.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

type MockResponse = Response & {
  send: jest.Mock<MockResponse, [string]>;
  setHeader: jest.Mock<MockResponse, [string, string]>;
  status: jest.Mock<MockResponse, [number]>;
};

describe('MetricsController', () => {
  it('writes raw Prometheus text without the JSON response envelope', () => {
    const metrics = {
      scrape: jest.fn(() =>
        [
          '# HELP vaultbank_service_info Service identity for this process.',
          '# TYPE vaultbank_service_info gauge',
          'vaultbank_service_info{service="auth-service"} 1',
          '',
        ].join('\n'),
      ),
    } as unknown as MetricsService;

    const response = {
      send: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn(),
    } as unknown as MockResponse;

    response.status.mockReturnValue(response);
    response.setHeader.mockReturnValue(response);
    response.send.mockReturnValue(response);

    new MetricsController(metrics).scrape(response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );

    const body = response.send.mock.calls[0][0];
    expect(body.startsWith('# HELP')).toBe(true);
    expect(body).toContain('# TYPE');
    expect(body).toContain('vaultbank_service_info');
    expect(body).not.toContain('{"success":');
  });

  it('keeps the normal API response envelope in the shared interceptor', async () => {
    const interceptor = new TransformInterceptor();
    const context = {} as ExecutionContext;
    const next = {
      handle: () => of({ accountId: 'acc-001' }),
    } as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).resolves.toEqual({
      success: true,
      data: { accountId: 'acc-001' },
      timestamp: expect.any(String),
    });
  });
});
