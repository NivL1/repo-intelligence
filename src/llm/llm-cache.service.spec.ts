import { LlmCacheService } from './llm-cache.service';
import { LlmProvider } from './interfaces/llm-provider.interface';

describe('LlmCacheService', () => {
  let provider: jest.Mocked<LlmProvider>;
  let redis: { get: jest.Mock; set: jest.Mock };
  let config: { get: jest.Mock };
  let service: LlmCacheService;

  beforeEach(() => {
    provider = { complete: jest.fn() };
    redis = { get: jest.fn(), set: jest.fn() };
    config = { get: jest.fn().mockReturnValue('ollama') };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new LlmCacheService(provider, redis as any, config as any);
  });

  it('returns the cached completion on a hit without calling the provider', async () => {
    redis.get.mockResolvedValue('a cached answer');

    const result = await service.complete('prompt text');

    expect(result).toBe('a cached answer');
    expect(provider.complete).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('calls the provider and caches the result with a TTL on a miss', async () => {
    redis.get.mockResolvedValue(null);
    provider.complete.mockResolvedValue('fresh answer');
    config.get.mockImplementation((key: string) =>
      key === 'llm.cacheTtlSeconds' ? 3600 : 'ollama',
    );

    const result = await service.complete('prompt text');

    expect(result).toBe('fresh answer');
    expect(provider.complete).toHaveBeenCalledWith('prompt text');
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), 'fresh answer', 'EX', 3600);
  });

  it('stores without a TTL when cacheTtlSeconds is not positive', async () => {
    redis.get.mockResolvedValue(null);
    provider.complete.mockResolvedValue('answer');
    config.get.mockImplementation((key: string) => (key === 'llm.cacheTtlSeconds' ? 0 : 'ollama'));

    await service.complete('prompt text');

    expect(redis.set).toHaveBeenCalledWith(expect.any(String), 'answer');
  });

  it('keys the cache by a hash of the prompt and the provider name, not the raw prompt', async () => {
    redis.get.mockResolvedValue(null);
    provider.complete.mockResolvedValue('answer');
    config.get.mockImplementation((key: string) => (key === 'llm.cacheTtlSeconds' ? 0 : 'ollama'));

    await service.complete('a whole prompt with code excerpts in it');

    const [key] = redis.set.mock.calls[0];
    expect(key).toMatch(/^llm:ollama:[0-9a-f]{64}$/);
    expect(key).not.toContain('a whole prompt');
  });
});
