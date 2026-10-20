import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicInDemoMode } from '../auth/decorators/public-in-demo-mode.decorator';
import { OverviewResultDto } from './dto/overview-result.dto';
import { OverviewService } from './overview.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get(':id/overview')
  @PublicInDemoMode()
  @ApiOperation({
    summary: 'A short LLM-generated summary of what this repository does',
    description:
      "Grounded in the repository's own extracted module/class/interface structure, not " +
      'the raw source — the same data `map` renders as a diagram. Cached: regenerated only ' +
      'when the repository is re-indexed into something different.',
  })
  async getOverview(@Param('id', ParseUUIDPipe) id: string): Promise<OverviewResultDto> {
    return { overview: await this.overview.getOverview(id) };
  }
}
