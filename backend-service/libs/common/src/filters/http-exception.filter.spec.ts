import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorDto } from '../dto/api-response.dto';
import { HttpExceptionFilter } from './http-exception.filter';

type MockResponse = Response & {
  json: jest.Mock<void, [ApiErrorDto]>;
  status: jest.Mock<MockResponse, [number]>;
};

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let response: MockResponse;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    const json = jest.fn<void, [ApiErrorDto]>();
    const status = jest.fn<MockResponse, [number]>();
    response = {
      json,
      status,
    } as unknown as MockResponse;
    status.mockReturnValue(response);
    host = {
      switchToHttp: () => ({
        getRequest: () => ({
          originalUrl: '/v1/auth/login',
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
  });

  it('preserves expected auth errors', () => {
    filter.catch(
      new UnauthorizedException('Invalid username or password'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Invalid username or password',
        }),
        success: false,
      }),
    );
  });

  it('does not leak database exception details to clients', () => {
    filter.catch(
      new Error('QueryFailedError: relation "users" does not exist'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0][0];
    expect(body.error.message).toBe('Unexpected infrastructure error');
    expect(JSON.stringify(body)).not.toContain('relation');
    expect(JSON.stringify(body)).not.toContain('users');
  });
});
