import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { EMBEDDINGS_PROVIDER } from './embeddings.constants';
import { EmbeddingsProvider } from './interfaces/embeddings-provider.interface';

/**
 * Wraps an EmbeddingsProvider with a Redis cache keyed by a hash of the
 * input text (plus the provider name, so switching providers can't return
 * a stale vector from a different embedding space) — avoids paying to
 * re-embed the same text twice.
 */
@Injectable()
export class EmbeddingCacheService {
  constructor(
    @Inject(EMBEDDINGS_PROVIDER) private readonly provider: EmbeddingsProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async embed(text: string): Promise<number[]> {
    const key = this.cacheKey(text);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as number[];
    }

    const vector = await this.provider.embed(text);
    const ttlSeconds = this.config.get<number>('embeddings.cacheTtlSeconds') ?? 0;
    if (ttlSeconds > 0) {
      await this.redis.set(key, JSON.stringify(vector), 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, JSON.stringify(vector));
    }
    return vector;
  }

  private cacheKey(text: string): string {
    const providerName = this.config.get<string>('embeddings.provider') ?? 'unknown';
    const hash = createHash('sha256').update(text).digest('hex');
    return `embedding:${providerName}:${hash}`;
  }
}
