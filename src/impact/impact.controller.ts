import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicInDemoMode } from '../auth/decorators/public-in-demo-mode.decorator';
import { ImpactQueryDto } from './dto/impact-query.dto';
import { ImpactResultDto, SymbolSummaryDto } from './dto/impact-result.dto';
import { ImpactService } from './impact.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class ImpactController {
  constructor(private readonly impact: ImpactService) {}

  @Get(':id/symbols')
  @PublicInDemoMode()
  @ApiOperation({
    summary: 'List every extracted symbol, for populating an impact-query picker',
    description:
      'Every class, method, function and interface the last index() run found, sorted ' +
      'by qualified name. No graph traversal — this is just the symbols table.',
  })
  async listSymbols(@Param('id', ParseUUIDPipe) id: string): Promise<SymbolSummaryDto[]> {
    return this.impact.listSymbols(id);
  }

  @Get(':id/impact')
  @PublicInDemoMode()
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
