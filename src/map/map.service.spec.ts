import { NotFoundException } from '@nestjs/common';
import { Edge, EdgeKind } from '../indexing/entities/edge.entity';
import { CodeSymbol, SymbolKind } from '../indexing/entities/symbol.entity';
import { MapService } from './map.service';

describe('MapService', () => {
  let symbols: { find: jest.Mock };
  let edges: { find: jest.Mock };
  let repositoriesService: { findOne: jest.Mock };
  let service: MapService;

  const symbol = (
    id: string,
    qualifiedName: string,
    filePath: string,
    kind: SymbolKind = 'method',
  ): CodeSymbol =>
    ({
      id,
      repositoryId: 'repo-id',
      name: qualifiedName.split('.').pop()!,
      qualifiedName,
      kind,
      filePath,
      startLine: 1,
      endLine: 10,
    }) as CodeSymbol;

  const edge = (from: string, to: string, kind: EdgeKind = 'calls'): Edge =>
    ({
      id: `${from}-${to}`,
      repositoryId: 'repo-id',
      fromSymbolId: from,
      toSymbolId: to,
      kind,
    }) as Edge;

  beforeEach(() => {
    symbols = { find: jest.fn() };
    edges = { find: jest.fn().mockResolvedValue([]) };
    repositoriesService = { findOne: jest.fn().mockResolvedValue({ id: 'repo-id' }) };

    service = new MapService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      symbols as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repositoriesService as any,
    );
  });

  it('propagates NotFoundException for an unknown repository, without querying symbols', async () => {
    repositoriesService.findOne.mockRejectedValue(new NotFoundException('nope'));

    await expect(service.getMap('missing-repo', {})).rejects.toThrow(NotFoundException);
    expect(symbols.find).not.toHaveBeenCalled();
  });

  it('tells the caller to index first when the repository has no symbols', async () => {
    symbols.find.mockResolvedValue([]);

    await expect(service.getMap('repo-id', {})).rejects.toThrow(/run POST .*\/index first/);
  });

  describe('module scope (default)', () => {
    it('collapses symbols into one node per module and counts the arrows between them', async () => {
      symbols.find.mockResolvedValue([
        symbol('s1', 'SearchService.search', 'src/search/search.service.ts'),
        symbol('s2', 'SearchController.query', 'src/search/search.controller.ts'),
        symbol('s3', 'EmbeddingCacheService.embed', 'src/embeddings/cache.service.ts'),
        symbol('s4', 'EmbeddingCacheService.cacheKey', 'src/embeddings/cache.service.ts'),
      ]);
      edges.find.mockResolvedValue([
        edge('s1', 's3'), // search -> embeddings
        edge('s1', 's4'), // search -> embeddings, again
        edge('s2', 's1'), // search -> search, intra-module
      ]);

      const result = await service.getMap('repo-id', {});

      expect(result.scope).toBe('module');
      expect(result.module).toBeNull();
      expect(result.nodeCount).toBe(2);
      // Only the cross-module pair: the intra-module edge is dropped.
      expect(result.edgeCount).toBe(1);
      expect(result.mermaid).toContain('"search"');
      expect(result.mermaid).toContain('"embeddings"');
      // Two underlying edges aggregated into one labelled arrow.
      expect(result.mermaid).toMatch(/n\d+ -->\|"2"\| n\d+/);
    });

    it('drops intra-module edges entirely rather than drawing self-loops', async () => {
      symbols.find.mockResolvedValue([
        symbol('s1', 'A.one', 'src/search/a.ts'),
        symbol('s2', 'B.two', 'src/search/b.ts'),
      ]);
      edges.find.mockResolvedValue([edge('s1', 's2'), edge('s2', 's1')]);

      const result = await service.getMap('repo-id', {});

      expect(result.nodeCount).toBe(1);
      expect(result.edgeCount).toBe(0);
      expect(result.mermaid).not.toContain('-->');
    });

    it('dots the arrow when a module pair is linked only by non-call relationships', async () => {
      symbols.find.mockResolvedValue([
        symbol('s1', 'SearchService', 'src/search/search.service.ts', 'class'),
        symbol('s2', 'EmbeddingsProvider', 'src/embeddings/provider.ts', 'interface'),
      ]);
      edges.find.mockResolvedValue([edge('s1', 's2', 'injects')]);

      const result = await service.getMap('repo-id', {});

      expect(result.mermaid).toMatch(/-\.->/);
    });

    it('keeps the arrow solid when at least one underlying relationship is a real call', async () => {
      symbols.find.mockResolvedValue([
        symbol('s1', 'SearchService.search', 'src/search/search.service.ts'),
        symbol('s2', 'Cache.embed', 'src/embeddings/cache.ts'),
      ]);
      edges.find.mockResolvedValue([edge('s1', 's2', 'injects'), edge('s1', 's2', 'calls')]);

      const result = await service.getMap('repo-id', {});

      expect(result.mermaid).toMatch(/n\d+ -->\|"2"\| n\d+/);
      expect(result.mermaid).not.toMatch(/-\.->/);
    });

    it('ignores edges whose endpoints are not in the symbol set', async () => {
      // Shouldn't happen with a consistent index, but a dangling edge must
      // not become a phantom module node.
      symbols.find.mockResolvedValue([symbol('s1', 'A.one', 'src/search/a.ts')]);
      edges.find.mockResolvedValue([edge('s1', 'gone'), edge('gone', 's1')]);

      const result = await service.getMap('repo-id', {});

      expect(result.nodeCount).toBe(1);
      expect(result.edgeCount).toBe(0);
    });
  });

  describe('symbol scope (?module=)', () => {
    beforeEach(() => {
      symbols.find.mockResolvedValue([
        symbol('s1', 'SearchService.search', 'src/search/search.service.ts'),
        symbol('s2', 'SearchService', 'src/search/search.service.ts', 'class'),
        symbol('s3', 'EmbeddingCacheService.embed', 'src/embeddings/cache.service.ts'),
        symbol('s4', 'AuthService.login', 'src/auth/auth.service.ts'),
      ]);
      edges.find.mockResolvedValue([
        edge('s1', 's3'), // search -> embeddings, crosses the boundary
        edge('s2', 's1'), // inside search
      ]);
    });

    it("draws the module's own symbols plus their direct neighbours, grouped by module", async () => {
      const result = await service.getMap('repo-id', { module: 'search' });

      expect(result.scope).toBe('symbol');
      expect(result.module).toBe('search');
      expect(result.mermaid).toContain('"SearchService.search"');
      expect(result.mermaid).toContain('"SearchService"');
      // The neighbour on the far side of the boundary is included...
      expect(result.mermaid).toContain('"EmbeddingCacheService.embed"');
      expect(result.mermaid).toContain('subgraph');
      expect(result.mermaid).toContain('"embeddings"');
      // ...but an unconnected symbol from a third module is not.
      expect(result.mermaid).not.toContain('AuthService.login');
    });

    it('shapes each node by symbol kind', async () => {
      const result = await service.getMap('repo-id', { module: 'search' });

      expect(result.mermaid).toMatch(/n\d+\[\["SearchService"\]\]/); // class
      expect(result.mermaid).toMatch(/n\d+\["SearchService\.search"\]/); // method
    });

    it('labels non-call edges with their kind and leaves calls unlabelled', async () => {
      edges.find.mockResolvedValue([edge('s1', 's3', 'injects')]);

      const result = await service.getMap('repo-id', { module: 'search' });

      expect(result.mermaid).toContain('|"injects"|');
    });

    it('404s for a module that does not exist', async () => {
      await expect(service.getMap('repo-id', { module: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('renders the same diagram regardless of the order rows come back in', async () => {
    // The reproducibility promise is the whole reason `map` avoids an LLM;
    // an unstable row order would undermine it just as effectively.
    const rows = [
      symbol('s1', 'A.one', 'src/search/a.ts'),
      symbol('s2', 'B.two', 'src/embeddings/b.ts'),
      symbol('s3', 'C.three', 'src/auth/c.ts'),
    ];
    const edgeRows = [edge('s1', 's2'), edge('s2', 's3'), edge('s3', 's1')];

    symbols.find.mockResolvedValue(rows);
    edges.find.mockResolvedValue(edgeRows);
    const first = await service.getMap('repo-id', {});

    symbols.find.mockResolvedValue([...rows].reverse());
    edges.find.mockResolvedValue([...edgeRows].reverse());
    const second = await service.getMap('repo-id', {});

    expect(first.mermaid).toBe(second.mermaid);
  });
});
