import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../auth.types';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

interface JwtRefreshStrategyInternals {
  _jwtFromRequest: (request: Request) => string | null;
}

describe('JwtRefreshStrategy', () => {
  const originalRefreshSecret = process.env.JWT_REFRESH_SECRET;

  beforeEach(() => {
    process.env.JWT_REFRESH_SECRET = 'unit-test-refresh-secret';
  });

  afterEach(() => {
    if (originalRefreshSecret === undefined) {
      delete process.env.JWT_REFRESH_SECRET;
    } else {
      process.env.JWT_REFRESH_SECRET = originalRefreshSecret;
    }
  });

  it('fails closed when JWT_REFRESH_SECRET has not been loaded', () => {
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => new JwtRefreshStrategy()).toThrow(
      'JWT_REFRESH_SECRET must be loaded from Vault',
    );
  });

  it('extracts the refresh token from the request body', () => {
    const strategy = new JwtRefreshStrategy();

    const internals = strategy as unknown as JwtRefreshStrategyInternals;

    const request = {
      body: {
        refresh_token: 'refresh-token-value',
      },
    } as Request;

    expect(internals._jwtFromRequest(request)).toBe('refresh-token-value');
  });

  it('returns null when the refresh token is absent', () => {
    const strategy = new JwtRefreshStrategy();

    const internals = strategy as unknown as JwtRefreshStrategyInternals;

    const request = {
      body: {},
    } as Request;

    expect(internals._jwtFromRequest(request)).toBeNull();
  });

  it('accepts a valid refresh-token payload', () => {
    const strategy = new JwtRefreshStrategy();

    const payload: JwtPayload = {
      sub: '6ca5e72e-64e8-4fd9-bf44-a7dca9c6b3af',
      email: 'customer@example.test',
      roles: ['customer'],
      type: 'refresh',
      jti: 'refresh-token-id',
    };

    expect(strategy.validate(payload)).toBe(payload);
  });

  it('rejects an access token presented as a refresh token', () => {
    const strategy = new JwtRefreshStrategy();

    const payload: JwtPayload = {
      sub: '6ca5e72e-64e8-4fd9-bf44-a7dca9c6b3af',
      email: 'customer@example.test',
      roles: ['customer'],
      type: 'access',
      jti: 'access-token-id',
    };

    expect(() => strategy.validate(payload)).toThrow(
      new UnauthorizedException('Invalid refresh token'),
    );
  });
});
