import { ApiProperty } from '@nestjs/swagger';

export class OverviewResultDto {
  @ApiProperty({
    description:
      'A short, LLM-generated summary of what the repository does and its key features, ' +
      'grounded in its extracted module/class/interface structure — not the raw source.',
  })
  overview!: string;
}
