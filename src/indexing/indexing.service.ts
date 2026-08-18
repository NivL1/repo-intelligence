import { randomUUID } from 'crypto';
import { access } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository as TypeOrmRepository } from 'typeorm';
import { EmbeddingCacheService } from '../embeddings/embedding-cache.service';
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
  chunksEmbedded: number;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    @InjectRepository(CodeSymbol) private readonly symbols: TypeOrmRepository<CodeSymbol>,
    @InjectRepository(Edge) private readonly edges: TypeOrmRepository<Edge>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repositoriesService: RepositoriesService,
    private readonly workspace: WorkspaceService,
    private readonly extractor: SymbolExtractor,
    private readonly embeddings: EmbeddingCacheService,
  ) {}

  /**
   * Parses a repository and replaces its symbol graph and chunk index —
   * one ts-morph pass feeds both. Always a full re-index, not incremental:
   * deleting a repository's symbols cascades to its edges (FK ON DELETE
   * CASCADE), but NOT to chunks (FK ON DELETE SET NULL — a chunk can
   * legitimately outlive the symbol it was extracted from), so chunks are
   * deleted explicitly rather than relying on that cascade. Incremental
   * reindex is a deliberate v0.2+ deferral, not an oversight — see
   * CLAUDE.md.
   *
   * Like nestjs-ai-starter's SearchService, chunk writes go through raw
   * SQL rather than a TypeORM entity/repository — TypeORM has no
   * first-class `vector` column type, so there's nothing a Chunk entity
   * would buy here.
   */
  async index(repositoryId: string): Promise<IndexRunResult> {
    const repository = await this.repositoriesService.findOne(repositoryId);
    await this.repositoriesService.update(repositoryId, { status: 'indexing' });

    try {
      const checkoutPath = await this.workspace.checkout(repositoryId, repository.source);
      const tsConfigFilePath = join(checkoutPath, 'tsconfig.json');
      await this.assertHasTsConfig(tsConfigFilePath);

      const commit = await this.workspace.headCommit(checkoutPath);
      const { symbols, edges, chunks } = this.extractor.extract(checkoutPath, tsConfigFilePath);

      await this.symbols.delete({ repositoryId });
      // Not covered by the symbols cascade — see the class doc comment.
      await this.dataSource.query(`DELETE FROM "chunks" WHERE "repository_id" = $1`, [
        repositoryId,
      ]);

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

      let chunksEmbedded = 0;
      for (const chunk of chunks) {
        const symbolId = keyToId.get(chunk.symbolKey);
        if (!symbolId) continue; // same defensive stance as edge resolution above

        // Cached by EmbeddingCacheService on (provider, content hash), so
        // re-indexing an unchanged method after a re-index elsewhere in
        // the file doesn't pay to re-embed it.
        const embedding = await this.embeddings.embed(chunk.content);
        await this.dataSource.query(
          `INSERT INTO "chunks"
             ("repository_id", "symbol_id", "content", "file_path", "start_line", "end_line", "embedding")
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
          [
            repositoryId,
            symbolId,
            chunk.content,
            chunk.filePath,
            chunk.startLine,
            chunk.endLine,
            toVectorLiteral(embedding),
          ],
        );
        chunksEmbedded++;
      }

      const updatedRepository = await this.repositoriesService.update(repositoryId, {
        status: 'ready',
        indexedCommit: commit,
        indexedAt: new Date(),
        error: null,
      });

      this.logger.log(
        `Indexed ${repository.name}: ${symbolRows.length} symbols, ${edgeRows.length} edges, ` +
          `${chunksEmbedded} chunks embedded`,
      );

      return {
        repository: updatedRepository,
        symbolsExtracted: symbolRows.length,
        edgesDiscovered: edgeRows.length,
        chunksEmbedded,
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

/** pgvector's text input format for a vector literal, e.g. "[0.1,0.2,0.3]". */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
