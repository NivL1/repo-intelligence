import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AskSourceDto {
  @ApiProperty({ description: 'Matches the [n] citation marker in the answer text.', example: 1 })
  n!: number;

  @ApiProperty() filePath!: string;
  @ApiProperty() startLine!: number;
  @ApiProperty() endLine!: number;

  @ApiPropertyOptional({ nullable: true })
  qualifiedName!: string | null;
}

export class AskResultDto {
  @ApiProperty({
    description: "The model's answer. Claims are tagged with [n], matching an entry in sources.",
  })
  answer!: string;

  @ApiProperty({ type: [AskSourceDto] })
  sources!: AskSourceDto[];
}
