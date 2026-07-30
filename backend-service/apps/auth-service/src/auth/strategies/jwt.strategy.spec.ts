import { UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'unit-test-access-secret';
  });

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('fails closed when JWT_SECRET has not been loaded', () => {
    delete process.env.JWT_SECRET;

    expect(() => new JwtStrategy()).toThrow(
      'JWT_SECRET must be loaded from Vault',
    );
  });

  it('accepts an access token and returns the authenticated user', () => {
    const strategy = new JwtStrategy();

    const payload: JwtPayload = {
      sub: '6ca5e72e-64e8-4fd9-bf44-a7dca9c6b3af',
      email: 'customer@example.test',
      roles: ['customer'],
      type: 'access',
      jti: 'access-token-id',
    };

    expect(strategy.validate(payload)).toEqual({
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles,
    });
  });

  it('rejects a refresh token presented as an access token', () => {
    const strategy = new JwtStrategy();

    const payload: JwtPayload = {
      sub: '6ca5e72e-64e8-4fd9-bf44-a7dca9c6b3af',
      email: 'customer@example.test',
      roles: ['customer'],
      type: 'refresh',
      jti: 'refresh-token-id',
    };

    expect(() => strategy.validate(payload)).toThrow(
      new UnauthorizedException('Invalid access token'),
    );
  });
});
