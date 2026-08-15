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
      create: jest.fn((row) => row),
      save: jest.fn((rows: Array<{ [key: string]: unknown }>) =>
        Promise.resolve(rows.map((row, i) => ({ ...row, id: `sym-${i}` }))),
      ),
    };
    edges = {
      create: jest.fn((row) => row),
      save: jest.fn((rows: unknown[]) => Promise.resolve(rows)),
    };
    repositoriesService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'repo-id', name: 'owner/repo', source: FIXTURE_ROOT }),
      update: jest.fn().mockResolvedValue(undefined),
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

    expect(edges.create).toHaveBeenCalledWith({
      repositoryId: 'repo-id',
      fromSymbolId: 'sym-1',
      toSymbolId: 'sym-0',
      kind: 'calls',
    });
    expect(result).toEqual({ symbolsExtracted: 2, edgesDiscovered: 1 });
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
