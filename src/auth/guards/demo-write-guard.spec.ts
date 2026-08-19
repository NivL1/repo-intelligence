import { ForbiddenException } from '@nestjs/common';
import { DemoWriteGuard } from './demo-write-guard';

describe('DemoWriteGuard', () => {
  function guardWith(demoMode: boolean): DemoWriteGuard {
    const config = { get: jest.fn().mockReturnValue(demoMode) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new DemoWriteGuard(config as any);
  }

  it('allows the request through when demo mode is off', () => {
    expect(guardWith(false).canActivate()).toBe(true);
  });

  it('blocks the request when demo mode is on, regardless of who is asking', () => {
    expect(() => guardWith(true).canActivate()).toThrow(ForbiddenException);
  });
});
