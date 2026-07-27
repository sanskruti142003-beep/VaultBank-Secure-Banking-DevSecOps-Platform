import { Global, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';
import { CacheService } from './cache.service';
import {
  REDIS_CACHE,
  REDIS_DATABASE,
  REDIS_OTP,
  REDIS_RATE_LIMIT,
  REDIS_SESSIONS,
} from './redis.constants';

function redisProvider(token: symbol, db: number): Provider {
  return {
    provide: token,
    inject: [ConfigService],
    useFactory: (config: ConfigService): Redis => {
      const tlsEnabled =
        config.get<string>('REDIS_TLS')?.toLowerCase() === 'true';
      const url = config.get<string>('REDIS_URL');
      const options: RedisOptions = {
        db,
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: config.get<number>('REDIS_CONNECT_TIMEOUT_MS', 5000),
        maxRetriesPerRequest: 3,
        retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
        ...(tlsEnabled ? { tls: {} } : {}),
      };

      if (url) {
        return new Redis(url, options);
      }

      return new Redis({
        ...options,
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
        password: config.getOrThrow<string>('REDIS_PASSWORD'),
      });
    },
  };
}

const redisProviders = [
  redisProvider(REDIS_SESSIONS, REDIS_DATABASE.sessions),
  redisProvider(REDIS_CACHE, REDIS_DATABASE.cache),
  redisProvider(REDIS_RATE_LIMIT, REDIS_DATABASE.rateLimit),
  redisProvider(REDIS_OTP, REDIS_DATABASE.otp),
];

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [...redisProviders, CacheService],
  exports: [...redisProviders, CacheService],
})
export class RedisModule {}
