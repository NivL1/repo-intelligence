import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicInDemoMode } from '../auth/decorators/public-in-demo-mode.decorator';
import { MapQueryDto } from './dto/map-query.dto';
import { MapResultDto } from './dto/map-result.dto';
import { MapService } from './map.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get(':id/map')
  @PublicInDemoMode()
  @ApiOperation({
    summary: 'Architecture diagram as Mermaid',
    description:
      'Renders the symbol graph as a Mermaid flowchart: modules and their coupling by ' +
      "default, or one module's symbols with ?module=. Graph traversal only — no LLM, " +
      'so the same indexed commit always produces the same diagram.',
  })
  async getMap(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MapQueryDto,
  ): Promise<MapResultDto> {
    return this.map.getMap(id, query);
  }
}
