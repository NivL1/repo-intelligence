import { ApiProperty } from '@nestjs/swagger';
import { RepositoryResponseDto } from '../../repositories/dto/repository-response.dto';

export class IndexResultDto {
  @ApiProperty({ type: RepositoryResponseDto })
  repository!: RepositoryResponseDto;

  @ApiProperty({ example: 218, description: 'Classes, methods, functions and interfaces found.' })
  symbolsExtracted!: number;

  @ApiProperty({
    example: 391,
    description: 'calls / implements / extends / injects relationships found.',
  })
  edgesDiscovered!: number;
}
