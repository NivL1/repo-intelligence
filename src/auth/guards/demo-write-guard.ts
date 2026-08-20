import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Blocks a route outright when config.demoMode is on — for the handful of
 * mutating actions a public demo must not expose regardless of who's
 * asking: registering an account, cloning an arbitrary URL, deleting the
 * seeded repo, or re-indexing it. Unlike JwtAuthGuard (which decides
 * WHO may call a route), this decides WHETHER the route may be called at
 * all in this deployment mode — the two compose independently, so a
 * route can be both auth-exempt (@PublicInDemoMode) for reads and
 * guard-blocked (this) for writes without the two interfering.
 *
 * No effect when demoMode is false — every route this guards behaves
 * exactly as it did before demo mode existed.
 */
@Injectable()
export class DemoWriteGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<boolean>('demoMode')) {
      throw new ForbiddenException('this action is disabled in the public demo');
    }
    return true;
  }
}
