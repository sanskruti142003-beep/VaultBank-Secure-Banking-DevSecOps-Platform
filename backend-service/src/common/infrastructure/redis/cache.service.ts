import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  DEFAULT_TTL_SECONDS,
  REDIS_CACHE,
  REDIS_OTP,
  REDIS_RATE_LIMIT,
  REDIS_SESSIONS,
} from './redis.constants';

const INCREMENT_WITH_EXPIRY_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS_SESSIONS) private readonly sessions: Redis,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(REDIS_RATE_LIMIT) private readonly rateLimits: Redis,
    @Inject(REDIS_OTP) private readonly otp: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(
      [this.sessions, this.cache, this.rateLimits, this.otp].map(
        async (client) => {
          if (client.status === 'wait') {
            await client.connect();
          }
          await client.ping();
        },
      ),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [this.sessions, this.cache, this.rateLimits, this.otp].map(
        async (client) => {
          if (client.status !== 'end') {
            await client.quit();
          }
        },
      ),
    );
  }

  async setSession<T>(
    userId: string,
    payload: T,
    ttlSeconds = DEFAULT_TTL_SECONDS.session,
  ): Promise<void> {
    await this.setJson(this.sessions, `session:${userId}`, payload, ttlSeconds);
  }

  async getSession<T>(userId: string): Promise<T | null> {
    return this.getJson<T>(this.sessions, `session:${userId}`);
  }

  async deleteSession(userId: string): Promise<void> {
    await this.sessions.del(`session:${userId}`);
  }

  async setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.setJson(this.cache, key, value, ttlSeconds);
  }

  async getCache<T>(key: string): Promise<T | null> {
    return this.getJson<T>(this.cache, key);
  }

  async invalidateCache(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async setAccountBalance(
    accountId: string,
    balance: string,
    ttlSeconds = DEFAULT_TTL_SECONDS.accountBalance,
  ): Promise<void> {
    await this.setCache(`balance:${accountId}`, balance, ttlSeconds);
  }

  async getAccountBalance(accountId: string): Promise<string | null> {
    return this.getCache<string>(`balance:${accountId}`);
  }

  async setUserProfile<T>(
    userId: string,
    profile: T,
    ttlSeconds = DEFAULT_TTL_SECONDS.userProfile,
  ): Promise<void> {
    await this.setCache(`user:${userId}`, profile, ttlSeconds);
  }

  async getUserProfile<T>(userId: string): Promise<T | null> {
    return this.getCache<T>(`user:${userId}`);
  }

  async setOtp(
    userId: string,
    purpose: string,
    code: string,
    ttlSeconds = DEFAULT_TTL_SECONDS.otp,
  ): Promise<void> {
    this.assertPositiveTtl(ttlSeconds);
    await this.otp.set(`otp:${userId}:${purpose}`, code, 'EX', ttlSeconds);
  }

  async getOtp(userId: string, purpose: string): Promise<string | null> {
    return this.otp.get(`otp:${userId}:${purpose}`);
  }

  async deleteOtp(userId: string, purpose: string): Promise<void> {
    await this.otp.del(`otp:${userId}:${purpose}`);
  }

  async incrementRateLimit(
    ip: string,
    route: string,
    ttlSeconds = DEFAULT_TTL_SECONDS.rateLimit,
  ): Promise<number> {
    this.assertPositiveTtl(ttlSeconds);
    const count = await this.rateLimits.eval(
      INCREMENT_WITH_EXPIRY_SCRIPT,
      1,
      `ratelimit:${ip}:${route}`,
      ttlSeconds,
    );
    return Number(count);
  }

  async getRateLimit(ip: string, route: string): Promise<number> {
    const value = await this.rateLimits.get(`ratelimit:${ip}:${route}`);
    return value === null ? 0 : Number(value);
  }

  async deleteRateLimit(ip: string, route: string): Promise<void> {
    await this.rateLimits.del(`ratelimit:${ip}:${route}`);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const responses = await Promise.all([
        this.sessions.ping(),
        this.cache.ping(),
        this.rateLimits.ping(),
        this.otp.ping(),
      ]);
      return responses.every((response) => response === 'PONG');
    } catch {
      return false;
    }
  }

  private async setJson<T>(
    client: Redis,
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    this.assertPositiveTtl(ttlSeconds);
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  private async getJson<T>(client: Redis, key: string): Promise<T | null> {
    const value = await client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  private assertPositiveTtl(ttlSeconds: number): void {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError('TTL must be a positive integer in seconds');
    }
  }
}
