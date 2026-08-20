import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_IN_DEMO_MODE_KEY } from '../decorators/public-in-demo-mode.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Applied globally via APP_GUARD in AuthModule. Routes opt out with
 * @Public() (health checks, register/login) instead of every other
 * route having to remember to opt in.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // @PublicInDemoMode() only exempts anything when demoMode is actually
    // on — read the flag here rather than bake it into the decorator's
    // metadata, so the exemption tracks the live config value instead of
    // whatever it happened to be at startup.
    const isPublicInDemoMode = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_IN_DEMO_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublicInDemoMode && this.config.get<boolean>('demoMode')) {
      return true;
    }

    return super.canActivate(context);
  }
}
