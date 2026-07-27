import Redis from 'ioredis';
import { CacheService } from './cache.service';

type RedisMock = {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
  eval: jest.Mock;
  ping: jest.Mock;
};

function redisMock(): RedisMock {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
  };
}

describe('CacheService', () => {
  let sessions: RedisMock;
  let cache: RedisMock;
  let rateLimits: RedisMock;
  let otp: RedisMock;
  let service: CacheService;

  beforeEach(() => {
    sessions = redisMock();
    cache = redisMock();
    rateLimits = redisMock();
    otp = redisMock();
    service = new CacheService(
      sessions as unknown as Redis,
      cache as unknown as Redis,
      rateLimits as unknown as Redis,
      otp as unknown as Redis,
    );
  });

  it('stores sessions under the required key with TTL', async () => {
    await service.setSession('user-1', { refreshTokenId: 'token-1' }, 60);

    expect(sessions.set).toHaveBeenCalledWith(
      'session:user-1',
      '{"refreshTokenId":"token-1"}',
      'EX',
      60,
    );
  });

  it('uses the dedicated OTP key format', async () => {
    await service.setOtp('user-1', 'login', 'hashed-code', 300);

    expect(otp.set).toHaveBeenCalledWith(
      'otp:user-1:login',
      'hashed-code',
      'EX',
      300,
    );
  });

  it('increments rate limits atomically and returns the count', async () => {
    rateLimits.eval.mockResolvedValue(4);

    await expect(
      service.incrementRateLimit('127.0.0.1', '/api/auth', 60),
    ).resolves.toBe(4);
    expect(rateLimits.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      'ratelimit:127.0.0.1:/api/auth',
      60,
    );
  });

  it('rejects invalid TTL values', async () => {
    await expect(service.setCache('key', 'value', 0)).rejects.toThrow(
      RangeError,
    );
  });
});
