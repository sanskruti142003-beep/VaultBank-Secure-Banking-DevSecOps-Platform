import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  REDIS_CACHE,
  REDIS_OTP,
  REDIS_RATE_LIMIT,
  REDIS_SESSIONS,
} from './redis.constants';

const INCREMENT_WITH_EXPIRY = `
  local value = redis.call('INCR', KEYS[1])
  if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return value
`;

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(REDIS_SESSIONS) private readonly sessions: Redis,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(REDIS_RATE_LIMIT) private readonly rateLimit: Redis,
    @Inject(REDIS_OTP) private readonly otp: Redis,
  ) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.clients.map(async (client) => {
        if (client.status === 'wait') {
          await client.connect();
        }
        await client.ping();
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.clients.map(async (client) => {
        if (client.status !== 'end') {
          await client.quit();
        }
      }),
    );
  }

  async setSession<T>(
    userId: string,
    payload: T,
    ttlSeconds = 604_800,
  ): Promise<void> {
    await this.setJson(this.sessions, `session:${userId}`, payload, ttlSeconds);
  }

  getSession<T>(userId: string): Promise<T | null> {
    return this.getJson<T>(this.sessions, `session:${userId}`);
  }

  async deleteSession(userId: string): Promise<void> {
    await this.sessions.del(`session:${userId}`);
  }

  async setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.setJson(this.cache, key, value, ttlSeconds);
  }

  getCache<T>(key: string): Promise<T | null> {
    return this.getJson<T>(this.cache, key);
  }

  async invalidateCache(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async setOtp(
    userId: string,
    purpose: string,
    hash: string,
    ttlSeconds = 300,
  ): Promise<void> {
    this.validateTtl(ttlSeconds);
    await this.otp.set(`otp:${userId}:${purpose}`, hash, 'EX', ttlSeconds);
  }

  getOtp(userId: string, purpose: string): Promise<string | null> {
    return this.otp.get(`otp:${userId}:${purpose}`);
  }

  async deleteOtp(userId: string, purpose: string): Promise<void> {
    await this.otp.del(`otp:${userId}:${purpose}`);
  }

  async incrementRateLimit(
    ip: string,
    route: string,
    ttlSeconds = 60,
  ): Promise<number> {
    this.validateTtl(ttlSeconds);
    const value = await this.rateLimit.eval(
      INCREMENT_WITH_EXPIRY,
      1,
      `ratelimit:${ip}:${route}`,
      ttlSeconds,
    );
    return Number(value);
  }

  async getRateLimit(ip: string, route: string): Promise<number> {
    const value = await this.rateLimit.get(`ratelimit:${ip}:${route}`);
    return value === null ? 0 : Number(value);
  }

  async deleteRateLimit(ip: string, route: string): Promise<void> {
    await this.rateLimit.del(`ratelimit:${ip}:${route}`);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const values = await Promise.all(
        this.clients.map((client) => client.ping()),
      );
      return values.every((value) => value === 'PONG');
    } catch {
      return false;
    }
  }

  private get clients(): Redis[] {
    return [this.sessions, this.cache, this.rateLimit, this.otp];
  }

  private async setJson<T>(
    client: Redis,
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<void> {
    this.validateTtl(ttlSeconds);
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  private async getJson<T>(client: Redis, key: string): Promise<T | null> {
    const value = await client.get(key);
    return value === null ? null : (JSON.parse(value) as T);
  }

  private validateTtl(ttlSeconds: number): void {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError('TTL must be a positive integer');
    }
  }
}
