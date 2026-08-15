import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { IndexingService } from './indexing.service';

describe('IndexingService', () => {
  const FIXTURE_ROOT = join(__dirname, '../../test/fixtures/symbol-extraction');

  let symbols: { delete: jest.Mock; create: jest.Mock; save: jest.Mock };
  let edges: { create: jest.Mock; save: jest.Mock };
  let repositoriesService: { findOne: jest.Mock; update: jest.Mock };
  let workspace: { checkout: jest.Mock; headCommit: jest.Mock };
  let extractor: { extract: jest.Mock };
  let service: IndexingService;

  beforeEach(() => {
    symbols = {
      delete: jest.fn().mockResolvedValue(undefined),
      // The service assigns ids itself before calling save() and never
      // reads save()'s return value for symbols, so this mock's return is
      // irrelevant — deliberately, that's the fix for the finding that
      // correlating save()'s returned order back to the input array isn't
      // a guarantee TypeORM/Postgres actually make.
      create: jest.fn((row) => row),
      save: jest.fn().mockResolvedValue(undefined),
    };
    edges = {
      create: jest.fn((row) => row),
      save: jest.fn((rows: unknown[]) => Promise.resolve(rows)),
    };
    repositoriesService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'repo-id', name: 'owner/repo', source: FIXTURE_ROOT }),
      update: jest.fn().mockResolvedValue({ id: 'repo-id', status: 'ready' }),
    };
    workspace = {
      checkout: jest.fn().mockResolvedValue(FIXTURE_ROOT),
      headCommit: jest.fn().mockResolvedValue('abc123'),
    };
    extractor = { extract: jest.fn() };

    service = new IndexingService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      symbols as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repositoriesService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workspace as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractor as any,
    );
  });

  it('marks the repository "indexing" before parsing starts', async () => {
    extractor.extract.mockReturnValue({ symbols: [], edges: [] });

    await service.index('repo-id');

    expect(repositoriesService.update).toHaveBeenCalledWith('repo-id', { status: 'indexing' });
  });

  it('clears previously extracted symbols before writing new ones', async () => {
    extractor.extract.mockReturnValue({ symbols: [], edges: [] });

    await service.index('repo-id');

    expect(symbols.delete).toHaveBeenCalledWith({ repositoryId: 'repo-id' });
  });

  it('persists extracted symbols and resolves edges to their generated ids', async () => {
    extractor.extract.mockReturnValue({
      symbols: [
        {
          key: 'a',
          name: 'Foo',
          qualifiedName: 'Foo',
          kind: 'class',
          filePath: 'foo.ts',
          startLine: 1,
          endLine: 5,
        },
        {
          key: 'b',
          name: 'bar',
          qualifiedName: 'Foo.bar',
          kind: 'method',
          filePath: 'foo.ts',
          startLine: 2,
          endLine: 3,
        },
      ],
      edges: [{ fromKey: 'b', toKey: 'a', kind: 'calls' }],
    });

    const result = await service.index('repo-id');

    // Ids are generated client-side (randomUUID), not read back from a
    // mocked save() — so assert the edge points at whatever id the "Foo"
    // and "bar" symbols actually got (create() is called in extraction
    // order: Foo first, bar second), rather than a hardcoded value.
    const [fooId, barId] = symbols.create.mock.results.map((r) => (r.value as { id: string }).id);

    expect(edges.create).toHaveBeenCalledWith({
      repositoryId: 'repo-id',
      fromSymbolId: barId,
      toSymbolId: fooId,
      kind: 'calls',
    });
    expect(result.symbolsExtracted).toBe(2);
    expect(result.edgesDiscovered).toBe(1);
  });

  it('drops an edge whose endpoint did not resolve to a saved symbol', async () => {
    extractor.extract.mockReturnValue({
      symbols: [
        {
          key: 'a',
          name: 'Foo',
          qualifiedName: 'Foo',
          kind: 'class',
          filePath: 'foo.ts',
          startLine: 1,
          endLine: 5,
        },
      ],
      edges: [{ fromKey: 'a', toKey: 'missing', kind: 'calls' }],
    });

    const result = await service.index('repo-id');

    expect(result.edgesDiscovered).toBe(0);
    expect(edges.save).not.toHaveBeenCalled();
  });

  it('marks the repository "ready" with the head commit once indexing succeeds', async () => {
    extractor.extract.mockReturnValue({ symbols: [], edges: [] });

    await service.index('repo-id');

    expect(repositoriesService.update).toHaveBeenLastCalledWith('repo-id', {
      status: 'ready',
      indexedCommit: 'abc123',
      indexedAt: expect.any(Date),
      error: null,
    });
  });

  it('returns the repository as updated by that final "ready" call, not a stale earlier read', async () => {
    extractor.extract.mockReturnValue({ symbols: [], edges: [] });
    repositoriesService.update.mockImplementation((_id: string, changes: Record<string, unknown>) =>
      Promise.resolve({ id: 'repo-id', ...changes }),
    );

    const result = await service.index('repo-id');

    // Proves the controller no longer needs its own findOne() to get a
    // consistent view — index() already returns the post-update repository.
    expect(result.repository).toEqual(expect.objectContaining({ status: 'ready' }));
  });

  it('rejects a repository with no tsconfig.json and marks it failed, without extracting', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'repo-intelligence-no-tsconfig-'));
    workspace.checkout.mockResolvedValue(emptyDir);

    await expect(service.index('repo-id')).rejects.toThrow(BadRequestException);
    expect(repositoriesService.update).toHaveBeenLastCalledWith('repo-id', {
      status: 'failed',
      error: expect.stringContaining('tsconfig.json'),
    });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('marks the repository failed if extraction itself throws', async () => {
    extractor.extract.mockImplementation(() => {
      throw new Error('parse error');
    });

    await expect(service.index('repo-id')).rejects.toThrow('parse error');
    expect(repositoriesService.update).toHaveBeenLastCalledWith('repo-id', {
      status: 'failed',
      error: 'parse error',
    });
  });
});
