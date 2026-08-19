import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MapQueryDto {
  @ApiPropertyOptional({
    description:
      'Zoom into one module and draw its individual symbols, plus any symbol outside ' +
      'the module directly connected to one of them. Omit for the default ' +
      'module-level architecture view.',
    example: 'search',
  })
  @IsOptional()
  @IsString()
  module?: string;
}
