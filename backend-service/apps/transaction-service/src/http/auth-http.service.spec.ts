import { AuthenticatedUser } from '@app/common';
import { HttpService } from '@nestjs/axios';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { AuthHttpService } from './auth-http.service';

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('Transaction AuthHttpService', () => {
  const originalAuthServiceUrl = process.env.AUTH_SERVICE_URL;

  let axiosGet: jest.Mock;
  let service: AuthHttpService;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.AUTH_SERVICE_URL;

    axiosGet = jest.fn();

    const http = {
      axiosRef: {
        get: axiosGet,
      },
    } as unknown as HttpService;

    service = new AuthHttpService(http);

    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();

    if (originalAuthServiceUrl === undefined) {
      delete process.env.AUTH_SERVICE_URL;
    } else {
      process.env.AUTH_SERVICE_URL = originalAuthServiceUrl;
    }

    jest.clearAllMocks();
  });

  it('returns the authenticated user for a valid token', async () => {
    const user: AuthenticatedUser = {
      userId: '8e6472d6-08a7-44e7-a267-13912e0bda50',
      email: 'customer@example.test',
      roles: ['customer'],
    };

    axiosGet.mockResolvedValue({
      data: {
        success: true,
        data: user,
      },
    });

    await expect(service.validateToken('access-token')).resolves.toEqual(user);

    expect(axiosGet).toHaveBeenCalledWith(
      'http://auth-service:3001/v1/auth/validate',
      expect.objectContaining({
        timeout: 5000,
        headers: expect.objectContaining({
          authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('maps an auth-service failure to UnauthorizedException', async () => {
    axiosGet.mockRejectedValue(new Error('Auth service unavailable'));

    await expect(service.validateToken('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('uses the configured auth service URL', async () => {
    process.env.AUTH_SERVICE_URL = 'http://custom-auth.example.test/v1';

    const customGet = jest.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          userId: '8e6472d6-08a7-44e7-a267-13912e0bda50',
          email: 'customer@example.test',
          roles: ['customer'],
        } satisfies AuthenticatedUser,
      },
    });

    const http = {
      axiosRef: {
        get: customGet,
      },
    } as unknown as HttpService;

    const customService = new AuthHttpService(http);

    await customService.validateToken('access-token');

    expect(customGet).toHaveBeenCalledWith(
      'http://custom-auth.example.test/v1/auth/validate',
      expect.any(Object),
    );
  });
});
