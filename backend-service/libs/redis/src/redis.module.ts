import { Global, Module, Provider } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import { CacheService } from './cache.service';
import {
  REDIS_CACHE,
  REDIS_DATABASE,
  REDIS_OTP,
  REDIS_RATE_LIMIT,
  REDIS_SESSIONS,
} from './redis.constants';

function provider(token: symbol, db: number): Provider {
  return {
    provide: token,
    useFactory: (): Redis => {
      const url = process.env.REDIS_URL;
      if (!url) {
        throw new Error('REDIS_URL must be loaded from Vault');
      }
      const options: RedisOptions = {
        db,
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
        retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
      };
      return new Redis(url, options);
    },
  };
}

const providers = [
  provider(REDIS_SESSIONS, REDIS_DATABASE.sessions),
  provider(REDIS_CACHE, REDIS_DATABASE.cache),
  provider(REDIS_RATE_LIMIT, REDIS_DATABASE.rateLimit),
  provider(REDIS_OTP, REDIS_DATABASE.otp),
];

@Global()
@Module({
  providers: [...providers, CacheService],
  exports: [...providers, CacheService],
})
export class RedisModule {}
