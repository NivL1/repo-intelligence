import { ApiProperty } from '@nestjs/swagger';
import { SymbolKind } from '../../indexing/entities/symbol.entity';

export class SymbolSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() qualifiedName!: string;
  @ApiProperty({ enum: ['class', 'interface', 'function', 'method'] }) kind!: SymbolKind;
  @ApiProperty() filePath!: string;
  @ApiProperty() startLine!: number;
  @ApiProperty() endLine!: number;
}

export class ImpactCallerDto {
  @ApiProperty({ type: SymbolSummaryDto })
  symbol!: SymbolSummaryDto;

  @ApiProperty({ description: 'Hops from the target symbol — 1 is a direct caller.', example: 1 })
  depth!: number;
}

export class ImpactResultDto {
  @ApiProperty({ type: SymbolSummaryDto })
  symbol!: SymbolSummaryDto;

  @ApiProperty({ type: [ImpactCallerDto] })
  callers!: ImpactCallerDto[];

  @ApiProperty({
    type: [String],
    description: 'Distinct modules (top-level directory under src/) any caller lives in.',
    example: ['auth', 'search'],
  })
  affectedModules!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Spec files that may cover the target or one of its callers, found by filename ' +
      'convention (foo.ts -> foo.spec.ts / foo.test.ts on disk) — not derived from the call ' +
      'graph, since test files are deliberately excluded from it.',
    example: ['src/search/search.service.spec.ts'],
  })
  relatedTests!: string[];
}
