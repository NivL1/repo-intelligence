import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { LlmProvider } from './interfaces/llm-provider.interface';
import { LLM_PROVIDER } from './llm.constants';

/**
 * Wraps an LlmProvider with a Redis cache keyed by a hash of the FULL
 * prompt (not just the bare question) — if retrieval results change
 * because the repository was re-indexed, the prompt changes too, which
 * naturally busts the cache. Mirrors EmbeddingCacheService's shape
 * exactly, for the same reason: avoid paying for the same completion
 * twice, e.g. repeated demo queries during testing.
 */
@Injectable()
export class LlmCacheService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  async complete(prompt: string): Promise<string> {
    const key = this.cacheKey(prompt);
    const cached = await this.redis.get(key);
    if (cached) {
      return cached;
    }

    const result = await this.provider.complete(prompt);
    const ttlSeconds = this.config.get<number>('llm.cacheTtlSeconds') ?? 0;
    if (ttlSeconds > 0) {
      await this.redis.set(key, result, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, result);
    }
    return result;
  }

  private cacheKey(prompt: string): string {
    const providerName = this.config.get<string>('llm.provider') ?? 'unknown';
    const hash = createHash('sha256').update(prompt).digest('hex');
    return `llm:${providerName}:${hash}`;
  }
}
