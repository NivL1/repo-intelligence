import { isAbsolute } from 'path';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { Repository } from './entities/repository.entity';
import { WorkspaceService } from './workspace.service';

@Injectable()
export class RepositoriesService {
  constructor(
    @InjectRepository(Repository)
    private readonly repositories: TypeOrmRepository<Repository>,
    private readonly workspace: WorkspaceService,
  ) {}

  /**
   * Registers a repository and materialises its working copy. Indexing —
   * symbol extraction and embedding — is a separate step, so this stays
   * fast and the row lands in 'pending' rather than 'ready'.
   */
  async create(source: string, name?: string): Promise<Repository> {
    const resolvedName = name ?? deriveName(source);

    // Fast path only — two concurrent requests for the same name can both
    // pass this check before either inserts. The actual guarantee is the
    // UQ_repositories_name constraint, enforced below.
    if (await this.repositories.existsBy({ name: resolvedName })) {
      throw new ConflictException(`a repository named "${resolvedName}" already exists`);
    }

    let repository: Repository;
    try {
      repository = await this.repositories.save(
        this.repositories.create({ name: resolvedName, source, status: 'cloning' }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`a repository named "${resolvedName}" already exists`);
      }
      throw error;
    }

    try {
      const checkoutPath = await this.workspace.checkout(repository.id, source);
      const commit = await this.workspace.headCommit(checkoutPath);
      return await this.update(repository.id, { status: 'pending', indexedCommit: commit });
    } catch (error) {
      // Keep the row rather than rolling back: a failed clone the caller
      // can GET and read the reason from beats a 500 with no trace.
      await this.update(repository.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  findAll(): Promise<Repository[]> {
    return this.repositories.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Repository> {
    const repository = await this.repositories.findOneBy({ id });
    if (!repository) {
      throw new NotFoundException(`repository ${id} not found`);
    }
    return repository;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id); // throws NotFoundException for an unknown id

    // Workspace first: if this throws, the row survives and the caller can
    // retry. Deleting the row first would risk the opposite failure mode —
    // a directory on disk with no row left pointing at it to retry from.
    await this.workspace.remove(id);
    // Symbols, edges and chunks go with it via ON DELETE CASCADE.
    await this.repositories.delete(id);
  }

  async update(id: string, changes: Partial<Repository>): Promise<Repository> {
    await this.repositories.update(id, changes);
    return this.findOne(id);
  }
}

/**
 * "https://github.com/NivL1/nestjs-ai-starter.git" -> "NivL1/nestjs-ai-starter"
 * "/Users/niv/Personal/nestjs-ai-starter"          -> "nestjs-ai-starter"
 *
 * Remote sources keep owner/repo because that pair is what identifies them;
 * a local path's parent directories are an accident of where it's checked
 * out, so only the leaf is meaningful.
 */
function deriveName(source: string): string {
  const trimmed = source.replace(/\.git$/, '').replace(/\/+$/, '');
  const segments = trimmed.split('/').filter(Boolean);
  const wanted = isAbsolute(source) ? 1 : 2;
  return segments.slice(-wanted).join('/') || trimmed;
}

/** Postgres error code 23505 = unique_violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
