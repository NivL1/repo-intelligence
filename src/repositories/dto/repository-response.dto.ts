import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Repository, RepositoryStatus } from '../entities/repository.entity';

export class RepositoryResponseDto {
  @ApiProperty({ example: '6a83ac88-21d0-4f54-872f-19a533291b18' })
  id!: string;

  @ApiProperty({ example: 'NivL1/nestjs-ai-starter' })
  name!: string;

  @ApiProperty({ example: 'https://github.com/NivL1/nestjs-ai-starter' })
  source!: string;

  @ApiProperty({ enum: ['pending', 'cloning', 'indexing', 'ready', 'failed'] })
  status!: RepositoryStatus;

  @ApiPropertyOptional({ example: '517c3df2a1b4c8e9f0d1a2b3c4d5e6f7a8b9c0d1', nullable: true })
  indexedCommit!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  indexedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Set when status is "failed".' })
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  static from(repository: Repository): RepositoryResponseDto {
    return {
      id: repository.id,
      name: repository.name,
      source: repository.source,
      status: repository.status,
      indexedCommit: repository.indexedCommit,
      indexedAt: repository.indexedAt,
      error: repository.error,
      createdAt: repository.createdAt,
    };
  }
}
