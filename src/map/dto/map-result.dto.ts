import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type MapScope = 'module' | 'symbol';

export class MapResultDto {
  @ApiProperty({
    description:
      'Mermaid flowchart source. Paste into any Mermaid renderer, or a GitHub ' +
      'markdown ```mermaid block.',
    example: 'flowchart LR\n  n0["auth"]\n  n1["users"]\n  n0 -->|"3"| n1',
  })
  mermaid!: string;

  @ApiProperty({
    enum: ['module', 'symbol'],
    description: '"module" is the whole-repo view; "symbol" is one module zoomed in.',
  })
  scope!: MapScope;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The module that was zoomed into, or null for the repo-wide view.',
  })
  module!: string | null;

  @ApiProperty({
    description: 'Nodes in the diagram — useful for spotting an unreadably large one.',
  })
  nodeCount!: number;

  @ApiProperty() edgeCount!: number;
}
