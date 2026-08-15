import { randomUUID } from 'crypto';
import { access } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { Repository } from '../repositories/entities/repository.entity';
import { RepositoriesService } from '../repositories/repositories.service';
import { WorkspaceService } from '../repositories/workspace.service';
import { Edge } from './entities/edge.entity';
import { CodeSymbol } from './entities/symbol.entity';
import { SymbolExtractor } from './symbol-extractor';

export interface IndexRunResult {
  repository: Repository;
  symbolsExtracted: number;
  edgesDiscovered: number;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @InjectRepository(CodeSymbol) private readonly symbols: TypeOrmRepository<CodeSymbol>,
    @InjectRepository(Edge) private readonly edges: TypeOrmRepository<Edge>,
    private readonly repositoriesService: RepositoriesService,
    private readonly workspace: WorkspaceService,
    private readonly extractor: SymbolExtractor,
  ) {}

  /**
   * Parses a repository and replaces its symbol graph. Always a full
   * re-index, not incremental — deleting a repository's symbols cascades
   * to its edges (FK ON DELETE CASCADE), so nothing stale from a previous
   * run survives. Incremental reindex is a deliberate v0.2+ deferral, not
   * an oversight — see CLAUDE.md.
   */
  async index(repositoryId: string): Promise<IndexRunResult> {
    const repository = await this.repositoriesService.findOne(repositoryId);
    await this.repositoriesService.update(repositoryId, { status: 'indexing' });

    try {
      const checkoutPath = await this.workspace.checkout(repositoryId, repository.source);
      const tsConfigFilePath = join(checkoutPath, 'tsconfig.json');
      await this.assertHasTsConfig(tsConfigFilePath);

      const commit = await this.workspace.headCommit(checkoutPath);
      const { symbols, edges } = this.extractor.extract(checkoutPath, tsConfigFilePath);

      await this.symbols.delete({ repositoryId });

      // Ids are assigned here, client-side, rather than left to Postgres's
      // column default — so keyToId below is built from what WE generated,
      // not from correlating positions in save()'s return array back to
      // the input array. TypeORM/Postgres don't guarantee a bulk INSERT's
      // RETURNING order matches VALUES order, so that correlation would be
      // an assumption, not a guarantee.
      const symbolRows = symbols.map((s) =>
        this.symbols.create({
          id: randomUUID(),
          repositoryId,
          name: s.name,
          qualifiedName: s.qualifiedName,
          kind: s.kind,
          filePath: s.filePath,
          startLine: s.startLine,
          endLine: s.endLine,
        }),
      );
      if (symbolRows.length) {
        await this.symbols.save(symbolRows);
      }

      const keyToId = new Map(symbols.map((s, i) => [s.key, symbolRows[i].id]));

      const edgeRows = edges
        .map((e) => {
          const fromSymbolId = keyToId.get(e.fromKey);
          const toSymbolId = keyToId.get(e.toKey);
          if (!fromSymbolId || !toSymbolId) return null;
          return this.edges.create({ repositoryId, fromSymbolId, toSymbolId, kind: e.kind });
        })
        .filter((row): row is Edge => row !== null);

      if (edgeRows.length) {
        await this.edges.save(edgeRows);
      }

      const updatedRepository = await this.repositoriesService.update(repositoryId, {
        status: 'ready',
        indexedCommit: commit,
        indexedAt: new Date(),
        error: null,
      });

      this.logger.log(
        `Indexed ${repository.name}: ${symbolRows.length} symbols, ${edgeRows.length} edges`,
      );

      return {
        repository: updatedRepository,
        symbolsExtracted: symbolRows.length,
        edgesDiscovered: edgeRows.length,
      };
    } catch (error) {
      await this.repositoriesService.update(repositoryId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async assertHasTsConfig(tsConfigFilePath: string): Promise<void> {
    try {
      await access(tsConfigFilePath);
    } catch {
      throw new BadRequestException(
        'no tsconfig.json found at the repository root — only TypeScript projects are supported',
      );
    }
  }
}
