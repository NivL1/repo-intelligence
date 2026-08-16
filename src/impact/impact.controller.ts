import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImpactQueryDto } from './dto/impact-query.dto';
import { ImpactResultDto } from './dto/impact-result.dto';
import { ImpactService } from './impact.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class ImpactController {
  constructor(private readonly impact: ImpactService) {}

  @Get(':id/impact')
  @ApiOperation({
    summary: 'What breaks if this symbol changes',
    description:
      'Reverse-walks the call graph to find direct and transitive callers, the modules ' +
      'they live in, and spec files that may cover them. Graph traversal only — no LLM.',
  })
  async getImpact(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ImpactQueryDto,
  ): Promise<ImpactResultDto> {
    return this.impact.getImpact(id, query);
  }
}
