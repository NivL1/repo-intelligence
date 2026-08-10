import { EmbeddingCacheService } from './embedding-cache.service';
import { EmbeddingsProvider } from './interfaces/embeddings-provider.interface';

describe('EmbeddingCacheService', () => {
  let provider: jest.Mocked<EmbeddingsProvider>;
  let redis: { get: jest.Mock; set: jest.Mock };
  let config: { get: jest.Mock };
  let service: EmbeddingCacheService;

  beforeEach(() => {
    provider = { embed: jest.fn() };
    redis = { get: jest.fn(), set: jest.fn() };
    config = { get: jest.fn().mockReturnValue('local') };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new EmbeddingCacheService(provider, redis as any, config as any);
  });

  it('returns the cached vector on a hit without calling the provider', async () => {
    const cached = [0.1, 0.2, 0.3];
    redis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.embed('hello');

    expect(result).toEqual(cached);
    expect(provider.embed).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('calls the provider and caches the result with a TTL on a miss', async () => {
    const vector = [0.4, 0.5, 0.6];
    redis.get.mockResolvedValue(null);
    provider.embed.mockResolvedValue(vector);
    config.get.mockImplementation((key: string) =>
      key === 'embeddings.cacheTtlSeconds' ? 3600 : 'local',
    );

    const result = await service.embed('hello');

    expect(result).toEqual(vector);
    expect(provider.embed).toHaveBeenCalledWith('hello');
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), JSON.stringify(vector), 'EX', 3600);
  });

  it('stores without a TTL when cacheTtlSeconds is not positive', async () => {
    redis.get.mockResolvedValue(null);
    provider.embed.mockResolvedValue([1, 2, 3]);
    config.get.mockImplementation((key: string) =>
      key === 'embeddings.cacheTtlSeconds' ? 0 : 'local',
    );

    await service.embed('hello');

    expect(redis.set).toHaveBeenCalledWith(expect.any(String), JSON.stringify([1, 2, 3]));
  });

  it('keys the cache by a hash of the text and the provider name, not the raw text', async () => {
    redis.get.mockResolvedValue(null);
    provider.embed.mockResolvedValue([1]);
    config.get.mockImplementation((key: string) =>
      key === 'embeddings.cacheTtlSeconds' ? 0 : 'local',
    );

    await service.embed('hello world');

    const [key] = redis.set.mock.calls[0];
    expect(key).toMatch(/^embedding:local:[0-9a-f]{64}$/);
    expect(key).not.toContain('hello world');
  });
});
