import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DemoWriteGuard } from '../auth/guards/demo-write-guard';
import { RepositoryResponseDto } from '../repositories/dto/repository-response.dto';
import { IndexResultDto } from './dto/index-result.dto';
import { IndexingService } from './indexing.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class IndexingController {
  constructor(private readonly indexing: IndexingService) {}

  @Post(':id/index')
  @UseGuards(DemoWriteGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parse a repository and (re)build its symbol graph and chunk index',
    description:
      'Runs the TypeScript compiler over the repository via ts-morph, replacing any ' +
      'previously extracted symbols, edges and chunks. Requires a tsconfig.json at the ' +
      'repository root.',
  })
  async index(@Param('id', ParseUUIDPipe) id: string): Promise<IndexResultDto> {
    const result = await this.indexing.index(id);
    return {
      repository: RepositoryResponseDto.from(result.repository),
      symbolsExtracted: result.symbolsExtracted,
      edgesDiscovered: result.edgesDiscovered,
      chunksEmbedded: result.chunksEmbedded,
    };
  }
}
