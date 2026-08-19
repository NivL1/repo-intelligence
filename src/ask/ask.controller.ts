import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AskQuestionDto } from './dto/ask-question.dto';
import { AskResultDto } from './dto/ask-result.dto';
import { AskService } from './ask.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Post(':id/ask')
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
