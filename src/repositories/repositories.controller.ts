import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { RepositoryResponseDto } from './dto/repository-response.dto';
import { RepositoriesService } from './repositories.service';

@ApiBearerAuth()
@ApiTags('repositories')
@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a repository and check out a working copy',
    description:
      'Clones an https:// git URL, or references an absolute local path in place. ' +
      'Returns with status "pending" — symbol extraction is a separate step.',
  })
  async create(@Body() dto: CreateRepositoryDto): Promise<RepositoryResponseDto> {
    return RepositoryResponseDto.from(await this.repositories.create(dto.source, dto.name));
  }

  @Get()
  @ApiOperation({ summary: 'List registered repositories' })
  async findAll(): Promise<RepositoryResponseDto[]> {
    const repositories = await this.repositories.findAll();
    return repositories.map(RepositoryResponseDto.from);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single repository' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<RepositoryResponseDto> {
    return RepositoryResponseDto.from(await this.repositories.findOne(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a repository',
    description: 'Cascades to its symbols, edges and chunks, and removes the working copy.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.repositories.remove(id);
  }
}
