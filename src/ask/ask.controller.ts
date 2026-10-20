import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicInDemoMode } from '../auth/decorators/public-in-demo-mode.decorator';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AskResultDto } from './dto/ask-result.dto';
import { AskService } from './ask.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Post(':id/ask')
  @PublicInDemoMode()
  // Tighter than the app-wide default (60/min) — this is the one route a
  // public demo lets anyone call with no account at all, and each call
  // costs real LLM money. 10 questions per 10 minutes per IP is enough
  // for someone genuinely trying the demo, not enough to run up a bill.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask a question about a repository, with cited answers',
    description:
      'Hybrid retrieval (vector similarity + exact symbol match + one hop of call-graph ' +
      'expansion), then an LLM answers using only the retrieved excerpts, citing which one ' +
      'backs each claim via [n] markers matching the returned sources.',
  })
  async askQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AskQuestionDto,
  ): Promise<AskResultDto> {
    return this.ask.ask(id, dto.question);
  }
}
