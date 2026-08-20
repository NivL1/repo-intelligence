import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_IN_DEMO_MODE_KEY = 'isPublicInDemoMode';

/**
 * Exempts a route from the global JwtAuthGuard, but only while
 * config.demoMode is on — unlike @Public(), this has NO effect in normal
 * operation, so it can only ever loosen access for the one deliberately
 * degraded deployment mode, never for the default product.
 *
 * Meant for read-only routes a public demo should let visitors browse
 * without an account: listing/viewing repositories, impact, map, ask.
 * Never apply this to a route that creates, deletes, or re-indexes
 * anything — see DemoWriteGuard for those instead, which blocks rather
 * than exempts.
 */
export const PublicInDemoMode = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_IN_DEMO_MODE_KEY, true);
