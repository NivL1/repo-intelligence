import { RetrievalService } from './retrieval.service';

type QueryImpl = (sql: string, params?: unknown[]) => Promise<unknown[]>;

describe('RetrievalService', () => {
  let dataSource: { query: jest.Mock };
  let embeddings: { embed: jest.Mock };
  let service: RetrievalService;

  /** Routes the mocked dataSource.query by a distinguishing substring in the SQL. */
  function mockQueries(
    overrides: Partial<Record<'vector' | 'symbol' | 'edges' | 'chunks', unknown[]>>,
  ) {
    const impl: QueryImpl = async (sql) => {
      if (sql.includes('ORDER BY distance')) return overrides.vector ?? [];
      if (sql.includes('FROM symbols')) return overrides.symbol ?? [];
      if (sql.includes('FROM edges')) return overrides.edges ?? [];
      if (sql.includes('c.symbol_id = ANY')) return overrides.chunks ?? [];
      throw new Error(`unexpected query: ${sql}`);
    };
    dataSource.query.mockImplementation(impl);
  }

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    embeddings = { embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new RetrievalService(dataSource as any, embeddings as any);
  });

  it('embeds the question before querying', async () => {
    mockQueries({});

    await service.retrieve('repo-id', 'how does search work');

    expect(embeddings.embed).toHaveBeenCalledWith('how does search work');
  });

  it('returns vector hits when nothing matches by name', async () => {
    mockQueries({
      vector: [
        {
          id: 'c1',
          content: 'code',
          filePath: 'a.ts',
          startLine: 1,
          endLine: 2,
          symbolId: 's1',
          qualifiedName: 'Foo.bar',
          distance: 0.4,
        },
      ],
    });

    const result = await service.retrieve('repo-id', 'a question with no real symbol names');

    expect(result).toEqual([
      {
        id: 'c1',
        content: 'code',
        filePath: 'a.ts',
        startLine: 1,
        endLine: 2,
        qualifiedName: 'Foo.bar',
        source: 'vector',
        distance: 0.4,
      },
    ]);
  });

  it('skips the symbol-name query entirely when the question has no identifier-like tokens', async () => {
    mockQueries({});

    await service.retrieve('repo-id', '???');

    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM symbols'),
      expect.anything(),
    );
  });

  it('includes an exact symbol-name match, tagged as "symbol", ahead of vector hits', async () => {
    mockQueries({
      vector: [
        {
          id: 'vec-1',
          content: 'vector-found code',
          filePath: 'v.ts',
          startLine: 1,
          endLine: 2,
          symbolId: 'sv',
          qualifiedName: 'Vec.thing',
          distance: 0.5,
        },
      ],
      symbol: [{ id: 'sym-1', qualifiedName: 'SearchService.search' }],
      chunks: [
        {
          id: 'chunk-1',
          content: 'search() { ... }',
          filePath: 'search.service.ts',
          startLine: 10,
          endLine: 20,
          symbolId: 'sym-1',
          qualifiedName: 'SearchService.search',
        },
      ],
    });

    const result = await service.retrieve('repo-id', 'how does SearchService.search work');

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'chunk-1',
        source: 'symbol',
        qualifiedName: 'SearchService.search',
      }),
    );
    expect(result[1]).toEqual(expect.objectContaining({ id: 'vec-1', source: 'vector' }));
  });

  it('expands one hop via outgoing calls edges from a symbol match, tagged as "graph"', async () => {
    mockQueries({
      symbol: [{ id: 'sym-1', qualifiedName: 'SearchService.search' }],
      edges: [{ toSymbolId: 'sym-2' }],
      chunks: [
        {
          id: 'chunk-1',
          content: 'search',
          filePath: 'search.service.ts',
          startLine: 1,
          endLine: 5,
          symbolId: 'sym-1',
          qualifiedName: 'SearchService.search',
        },
        {
          id: 'chunk-2',
          content: 'embed',
          filePath: 'embedding-cache.service.ts',
          startLine: 1,
          endLine: 5,
          symbolId: 'sym-2',
          qualifiedName: 'EmbeddingCacheService.embed',
        },
      ],
    });

    const result = await service.retrieve('repo-id', 'SearchService.search');

    const [edgesSql, edgesParams] = dataSource.query.mock.calls.find(([sql]) =>
      sql.includes('FROM edges'),
    );
    expect(edgesSql).toContain("kind = 'calls'");
    expect(edgesParams).toEqual(['repo-id', ['sym-1']]);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'chunk-1', source: 'symbol' }),
        expect.objectContaining({ id: 'chunk-2', source: 'graph' }),
      ]),
    );
  });

  it('does not re-fetch or duplicate a chunk that vector search already found', async () => {
    mockQueries({
      vector: [
        {
          id: 'chunk-1',
          content: 'search',
          filePath: 'search.service.ts',
          startLine: 1,
          endLine: 5,
          symbolId: 'sym-1',
          qualifiedName: 'SearchService.search',
          distance: 0.2,
        },
      ],
      symbol: [{ id: 'sym-1', qualifiedName: 'SearchService.search' }],
    });

    const result = await service.retrieve('repo-id', 'SearchService.search');

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('vector');
    // The one symbol already covered by the vector hit shouldn't trigger
    // a redundant "fetch chunks for these ids" query.
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('c.symbol_id = ANY'),
      expect.anything(),
    );
  });

  it('truncates to the limit, keeping symbol/graph hits over weaker vector hits', async () => {
    const vectorHits = Array.from({ length: 5 }, (_, i) => ({
      id: `vec-${i}`,
      content: 'x',
      filePath: `v${i}.ts`,
      startLine: 1,
      endLine: 2,
      symbolId: `vs${i}`,
      qualifiedName: `V${i}`,
      distance: 0.1 * i,
    }));
    mockQueries({
      vector: vectorHits,
      symbol: [{ id: 'sym-1', qualifiedName: 'Important.one' }],
      chunks: [
        {
          id: 'important-chunk',
          content: 'important',
          filePath: 'important.ts',
          startLine: 1,
          endLine: 2,
          symbolId: 'sym-1',
          qualifiedName: 'Important.one',
        },
      ],
    });

    const result = await service.retrieve('repo-id', 'Important.one', 3);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('important-chunk');
    // Only the 2 closest vector hits survive alongside the exact match.
    expect(result.map((r) => r.id)).toEqual(['important-chunk', 'vec-0', 'vec-1']);
  });

  it('returns nothing for a repository with no indexed chunks', async () => {
    mockQueries({});

    const result = await service.retrieve('repo-id', 'anything at all');

    expect(result).toEqual([]);
  });
});
