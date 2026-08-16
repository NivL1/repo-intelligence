import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_IMPACT_DEPTH = 3;
export const MAX_IMPACT_DEPTH = 10;

export class ImpactQueryDto {
  @ApiPropertyOptional({
    description:
      'Qualified name to look up, e.g. "SearchService.search". Ambiguous if it ' +
      'matches more than one symbol — retry with symbolId in that case.',
    example: 'SearchService.search',
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: 'Exact symbol id — unambiguous, skips the name lookup.' })
  @IsOptional()
  @IsUUID()
  symbolId?: string;

  @ApiPropertyOptional({
    description: 'How many hops of callers to walk.',
    default: DEFAULT_IMPACT_DEPTH,
    minimum: 1,
    maximum: MAX_IMPACT_DEPTH,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPACT_DEPTH)
  depth?: number;
}
