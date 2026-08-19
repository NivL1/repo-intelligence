import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';

export class PublicConfigDto {
  demoMode!: boolean;
}

/**
 * The one config value a CLIENT needs before it can decide how to
 * behave — specifically, whether the dashboard should show a login wall
 * at all. Everything else demoMode affects is enforced server-side
 * regardless of what this reports; a client that ignored this endpoint
 * entirely would still be correctly blocked from mutating anything (see
 * DemoWriteGuard) and still correctly allowed to browse (see
 * @PublicInDemoMode). This only controls what the UI *shows*.
 */
@ApiTags('config')
@Controller('config')
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'The subset of server config a client needs to know' })
  get(): PublicConfigDto {
    return { demoMode: this.config.get<boolean>('demoMode') ?? false };
  }
}
