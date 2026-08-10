import { HealthCheckError } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis-health.indicator';

describe('RedisHealthIndicator', () => {
  let redis: { ping: jest.Mock };
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    redis = { ping: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indicator = new RedisHealthIndicator(redis as any);
  });

  it('reports up when ping replies PONG', async () => {
    redis.ping.mockResolvedValue('PONG');

    const result = await indicator.isHealthy('redis');

    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('throws a HealthCheckError with down status on a non-PONG reply', async () => {
    redis.ping.mockResolvedValue('unexpected');

    try {
      await indicator.isHealthy('redis');
      fail('expected isHealthy to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      // The initial "unhealthy" throw happens inside the same try block, so
      // it's re-caught and re-wrapped by the outer catch — hence the
      // "Redis ping failed" message ending up in causes here too.
      expect((err as HealthCheckError).causes).toEqual({
        redis: { status: 'down', message: 'Redis ping failed' },
      });
    }
  });

  it('throws a HealthCheckError with down status and a message when ping rejects', async () => {
    redis.ping.mockRejectedValue(new Error('connection refused'));

    try {
      await indicator.isHealthy('redis');
      fail('expected isHealthy to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(HealthCheckError);
      expect((err as HealthCheckError).causes).toEqual({
        redis: { status: 'down', message: 'connection refused' },
      });
    }
  });
});
