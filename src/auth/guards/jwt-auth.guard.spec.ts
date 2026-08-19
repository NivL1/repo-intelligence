import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let config: { get: jest.Mock };
  let guard: JwtAuthGuard;
  let superCanActivate: jest.SpyInstance;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    config = { get: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guard = new JwtAuthGuard(reflector as any, config as any);

    // The real chain (super.canActivate -> passport's jwt strategy) needs
    // an actual HTTP request to do anything meaningful — that's Passport's
    // behavior, not this guard's. What this guard owns is the decision of
    // WHETHER to reach that chain at all, so that's what's under test:
    // spying on the inherited method proves delegation happened without
    // re-testing Passport itself.
    superCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    superCanActivate.mockRestore();
  });

  it('exempts a route marked @Public(), regardless of demo mode', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === 'isPublic');

    expect(guard.canActivate(context)).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('exempts a @PublicInDemoMode() route when demo mode is on', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === 'isPublicInDemoMode');
    config.get.mockReturnValue(true);

    expect(guard.canActivate(context)).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('does NOT exempt a @PublicInDemoMode() route when demo mode is off — this is the whole point', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === 'isPublicInDemoMode');
    config.get.mockReturnValue(false);

    guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });

  it('falls through to real auth for a route with neither decorator', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    config.get.mockReturnValue(true);

    guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
  });
});
