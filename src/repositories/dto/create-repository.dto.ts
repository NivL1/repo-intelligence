import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateRepositoryDto {
  @ApiProperty({
    description: 'An https:// git URL, or an absolute path to a local checkout.',
    example: 'https://github.com/NivL1/nestjs-ai-starter',
  })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiPropertyOptional({
    description: 'Display name. Defaults to the last two segments of the source.',
    example: 'NivL1/nestjs-ai-starter',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[\w.\-/]{1,255}$/, {
    message: 'name may only contain letters, numbers, dots, dashes, underscores and slashes',
  })
  name?: string;
}
