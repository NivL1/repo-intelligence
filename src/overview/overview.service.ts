import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository as TypeOrmRepository } from 'typeorm';
import { CodeSymbol } from '../indexing/entities/symbol.entity';
import { moduleOf } from '../indexing/module-path';
import { LlmCacheService } from '../llm/llm-cache.service';
import { RepositoriesService } from '../repositories/repositories.service';

/** Per module, how many class/interface names to show the LLM — enough to
 *  convey shape, not so many that a large repo blows the prompt budget. */
const MAX_SYMBOLS_PER_MODULE = 8;

/**
 * A short, LLM-generated summary of what an indexed repository does and
 * its key features — the one thing `impact`/`map`/`ask` don't already
 * answer, since none of them describe a repo as a whole.
 *
 * Deliberately NOT built on hybrid retrieval the way `ask` is: a broad
 * "what is this repo" question has no specific chunk to retrieve toward,
 * so this instead summarizes the repo's own compiler-extracted STRUCTURE
 * (modules and their classes/interfaces) — the same data `map` renders as
 * a diagram, fed to the LLM as text instead of as a picture. Grounding in
 * structure rather than chunk content also keeps the prompt small
 * regardless of how large the repo's actual source is.
 *
 * Cached by LlmCacheService the same way `ask` answers are: the prompt is
 * fully determined by the current symbol set, so it's naturally
 * regenerated only when the repo is re-indexed into something different,
 * not on every request.
 */
@Injectable()
export class OverviewService {
  constructor(
    @InjectRepository(CodeSymbol) private readonly symbols: TypeOrmRepository<CodeSymbol>,
    private readonly repositoriesService: RepositoriesService,
    private readonly llm: LlmCacheService,
  ) {}

  async getOverview(repositoryId: string): Promise<string> {
    const repository = await this.repositoriesService.findOne(repositoryId);
    const symbols = await this.symbols.find({ where: { repositoryId } });
    return this.llm.complete(buildOverviewPrompt(repository.name, symbols));
  }
}

function buildOverviewPrompt(repoName: string, symbols: CodeSymbol[]): string {
  const byModule = new Map<string, string[]>();
  for (const symbol of symbols) {
    if (symbol.kind !== 'class' && symbol.kind !== 'interface') continue;
    const module = moduleOf(symbol.filePath);
    const names = byModule.get(module) ?? [];
    names.push(symbol.name);
    byModule.set(module, names);
  }

  const structure = [...byModule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, names]) => {
      const sorted = [...names].sort();
      const shown = sorted.slice(0, MAX_SYMBOLS_PER_MODULE);
      const rest = sorted.length - shown.length;
      return `- ${module}: ${shown.join(', ')}${rest > 0 ? ` (+${rest} more)` : ''}`;
    })
    .join('\n');

  return [
    `Below is the module structure of a TypeScript repository named "${repoName}", ` +
      'extracted by the compiler — each module and its main classes/interfaces:',
    '',
    structure || '(no classes or interfaces were extracted)',
    '',
    'Write a short, high-level overview of what this project does and its key features, ' +
      'in 2-4 sentences. Base it only on the structure above — do not invent functionality ' +
      "the names don't imply.",
  ].join('\n');
}
