import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AskQuestionDto {
  @ApiProperty({ example: 'How does semantic search work in this project?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;
}
