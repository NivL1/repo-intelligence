import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Global module exposing a single shared ioredis client via DI token.
 * Marked @Global so feature modules (embedding cache, rate limiting,
 * health checks) can inject REDIS_CLIENT without re-importing this
 * module everywhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redis.url');
        return new Redis(url as string, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
