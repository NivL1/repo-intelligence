import { NotFoundException } from '@nestjs/common';
import { CodeSymbol, SymbolKind } from '../indexing/entities/symbol.entity';
import { OverviewService } from './overview.service';

describe('OverviewService', () => {
  let symbols: { find: jest.Mock };
  let repositoriesService: { findOne: jest.Mock };
  let llm: { complete: jest.Mock };
  let service: OverviewService;

  const symbol = (
    qualifiedName: string,
    filePath: string,
    kind: SymbolKind = 'class',
  ): CodeSymbol =>
    ({
      id: qualifiedName,
      repositoryId: 'repo-id',
      name: qualifiedName,
      qualifiedName,
      kind,
      filePath,
      startLine: 1,
      endLine: 10,
    }) as CodeSymbol;

  beforeEach(() => {
    symbols = { find: jest.fn().mockResolvedValue([]) };
    repositoriesService = {
      findOne: jest.fn().mockResolvedValue({ id: 'repo-id', name: 'NivL1/example' }),
    };
    llm = { complete: jest.fn().mockResolvedValue('a summary') };

    service = new OverviewService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      symbols as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repositoriesService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llm as any,
    );
  });

  it('propagates NotFoundException for an unknown repository, without querying symbols', async () => {
    repositoriesService.findOne.mockRejectedValue(new NotFoundException('nope'));

    await expect(service.getOverview('missing-repo')).rejects.toThrow(NotFoundException);
    expect(symbols.find).not.toHaveBeenCalled();
  });

  it('returns whatever the LLM produces', async () => {
    const result = await service.getOverview('repo-id');
    expect(result).toBe('a summary');
  });

  it('groups classes and interfaces by module, sorted, in the prompt', async () => {
    symbols.find.mockResolvedValue([
      symbol('SearchService', 'src/search/search.service.ts', 'class'),
      symbol('SearchResult', 'src/search/types.ts', 'interface'),
      symbol('AuthService', 'src/auth/auth.service.ts', 'class'),
    ]);

    await service.getOverview('repo-id');

    const [prompt] = llm.complete.mock.calls[0];
    expect(prompt).toContain('NivL1/example');
    // Modules sorted alphabetically, so auth appears before search.
    expect(prompt.indexOf('- auth:')).toBeLessThan(prompt.indexOf('- search:'));
    // Symbol names sorted within a module.
    expect(prompt).toContain('- search: SearchResult, SearchService');
  });

  it('excludes methods and functions — only classes/interfaces convey shape', async () => {
    symbols.find.mockResolvedValue([
      symbol('SearchService', 'src/search/search.service.ts', 'class'),
      symbol('SearchService.search', 'src/search/search.service.ts', 'method'),
      symbol('formatName', 'src/search/format.ts', 'function'),
    ]);

    await service.getOverview('repo-id');

    const [prompt] = llm.complete.mock.calls[0];
    expect(prompt).toContain('SearchService');
    expect(prompt).not.toContain('SearchService.search');
    expect(prompt).not.toContain('formatName');
  });

  it('caps symbols shown per module and notes how many were omitted', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      symbol(`Class${i}`, `src/big/class${i}.ts`, 'class'),
    );
    symbols.find.mockResolvedValue(many);

    await service.getOverview('repo-id');

    const [prompt] = llm.complete.mock.calls[0];
    expect(prompt).toContain('(+2 more)');
  });

  it('tells the model to stick to the given structure, not invent functionality', async () => {
    await service.getOverview('repo-id');

    const [prompt] = llm.complete.mock.calls[0];
    expect(prompt).toMatch(/do not invent functionality/i);
  });

  it('says plainly when no classes or interfaces were extracted, rather than an empty list', async () => {
    symbols.find.mockResolvedValue([symbol('formatName', 'src/format.ts', 'function')]);

    await service.getOverview('repo-id');

    const [prompt] = llm.complete.mock.calls[0];
    expect(prompt).toContain('no classes or interfaces were extracted');
  });
});
