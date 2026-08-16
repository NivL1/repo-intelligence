import { access } from 'fs/promises';
import { join } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository as TypeOrmRepository } from 'typeorm';
import { RepositoriesService } from '../repositories/repositories.service';
import { WorkspaceService } from '../repositories/workspace.service';
import { Edge } from '../indexing/entities/edge.entity';
import { CodeSymbol } from '../indexing/entities/symbol.entity';
import { AmbiguousSymbolException } from './ambiguous-symbol.exception';
import { DEFAULT_IMPACT_DEPTH, ImpactQueryDto } from './dto/impact-query.dto';
import { ImpactCallerDto, ImpactResultDto, SymbolSummaryDto } from './dto/impact-result.dto';

/**
 * Blast-radius analysis: who calls this, transitively, and what tests might
 * cover them. Pure graph traversal on data Day 2 already extracted — no LLM
 * anywhere in this path, so the answer is reproducible, not probabilistic.
 */
@Injectable()
export class ImpactService {
  constructor(
    @InjectRepository(CodeSymbol) private readonly symbols: TypeOrmRepository<CodeSymbol>,
    @InjectRepository(Edge) private readonly edges: TypeOrmRepository<Edge>,
    private readonly repositoriesService: RepositoriesService,
    private readonly workspace: WorkspaceService,
  ) {}

  async getImpact(repositoryId: string, query: ImpactQueryDto): Promise<ImpactResultDto> {
    const repository = await this.repositoriesService.findOne(repositoryId);
    const target = await this.resolveSymbol(repositoryId, query);
    const depth = query.depth ?? DEFAULT_IMPACT_DEPTH;

    const callers = await this.walkCallers(repositoryId, target.id, depth);
    const affectedModules = [...new Set(callers.map((c) => moduleOf(c.symbol.filePath)))].sort();
    const relatedTests = await this.findRelatedTests(repositoryId, repository.source, [
      target.filePath,
      ...callers.map((c) => c.symbol.filePath),
    ]);

    return { symbol: toSummary(target), callers, affectedModules, relatedTests };
  }

  private async resolveSymbol(repositoryId: string, query: ImpactQueryDto): Promise<CodeSymbol> {
    if (query.symbol && query.symbolId) {
      throw new BadRequestException('pass either "symbol" or "symbolId", not both');
    }

    if (query.symbolId) {
      const symbol = await this.symbols.findOneBy({ id: query.symbolId, repositoryId });
      if (!symbol) {
        throw new NotFoundException(`no symbol with id "${query.symbolId}" in this repository`);
      }
      return symbol;
    }

    if (!query.symbol) {
      throw new BadRequestException('pass either "symbol" (a qualified name) or "symbolId"');
    }

    const matches = await this.symbols.findBy({ repositoryId, qualifiedName: query.symbol });
    if (matches.length === 0) {
      throw new NotFoundException(`no symbol named "${query.symbol}" in this repository`);
    }
    if (matches.length > 1) {
      throw new AmbiguousSymbolException(query.symbol, matches);
    }
    return matches[0];
  }

  /**
   * Breadth-first reverse walk of `calls` edges: each level is everything
   * that calls something found at the previous level. `visited` both
   * prevents infinite loops on call cycles (mutual recursion) and keeps
   * each symbol reported once, at the shortest depth it's reachable from.
   */
  private async walkCallers(
    repositoryId: string,
    targetId: string,
    maxDepth: number,
  ): Promise<ImpactCallerDto[]> {
    const callers: ImpactCallerDto[] = [];
    const visited = new Set<string>([targetId]);
    let frontier = [targetId];

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const incoming = await this.edges.find({
        where: { repositoryId, kind: 'calls', toSymbolId: In(frontier) },
      });
      const nextIds = [...new Set(incoming.map((e) => e.fromSymbolId))].filter(
        (id) => !visited.has(id),
      );
      if (nextIds.length === 0) break;

      const nextSymbols = await this.symbols.find({ where: { id: In(nextIds), repositoryId } });
      for (const symbol of nextSymbols) {
        visited.add(symbol.id);
        callers.push({ symbol: toSummary(symbol), depth });
      }
      frontier = nextSymbols.map((s) => s.id);
    }

    return callers;
  }

  /**
   * Convention-based, not graph-derived: test files are deliberately
   * excluded from symbol extraction (see symbol-extractor.ts), so there's
   * no edge to walk here. This checks the filesystem left behind by the
   * last index() run for a co-located foo.spec.ts / foo.test.ts next to
   * each affected file — the near-universal Jest/Nest convention, and the
   * one this very repo follows.
   */
  private async findRelatedTests(
    repositoryId: string,
    source: string,
    filePaths: string[],
  ): Promise<string[]> {
    const root = this.workspace.resolvePath(repositoryId, source);
    const found = new Set<string>();

    for (const filePath of new Set(filePaths)) {
      for (const candidate of specCandidates(filePath)) {
        if (await exists(join(root, candidate))) {
          found.add(candidate);
        }
      }
    }

    return [...found].sort();
  }
}

function toSummary(symbol: CodeSymbol): SymbolSummaryDto {
  return {
    id: symbol.id,
    name: symbol.name,
    qualifiedName: symbol.qualifiedName,
    kind: symbol.kind,
    filePath: symbol.filePath,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  };
}

/**
 * "src/search/search.service.ts" -> "search"; "src/main.ts" -> "src".
 * A heuristic, not a real module boundary — good enough to group blast
 * radius results without needing NestJS-specific module-file parsing.
 */
function moduleOf(filePath: string): string {
  const segments = filePath.split('/');
  return segments[0] === 'src' && segments.length > 2 ? segments[1] : segments[0];
}

function specCandidates(filePath: string): string[] {
  if (!filePath.endsWith('.ts')) return [];
  const base = filePath.slice(0, -'.ts'.length);
  return [`${base}.spec.ts`, `${base}.test.ts`];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
