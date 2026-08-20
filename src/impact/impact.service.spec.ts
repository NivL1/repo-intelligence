import { join } from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AmbiguousSymbolException } from './ambiguous-symbol.exception';
import { ImpactService } from './impact.service';

const FIXTURE_ROOT = join(__dirname, '../../test/fixtures/symbol-extraction');

function symbol(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'id-1',
    repositoryId: 'repo-id',
    name: 'Foo',
    qualifiedName: 'Foo',
    kind: 'class',
    filePath: 'src/foo.ts',
    startLine: 1,
    endLine: 5,
    ...overrides,
  };
}

describe('ImpactService', () => {
  let symbols: { findOneBy: jest.Mock; findBy: jest.Mock; find: jest.Mock };
  let edges: { find: jest.Mock };
  let repositoriesService: { findOne: jest.Mock };
  let workspace: { resolvePath: jest.Mock };
  let service: ImpactService;

  beforeEach(() => {
    symbols = { findOneBy: jest.fn(), findBy: jest.fn(), find: jest.fn() };
    edges = { find: jest.fn() };
    repositoriesService = {
      findOne: jest.fn().mockResolvedValue({ id: 'repo-id', source: FIXTURE_ROOT }),
    };
    workspace = { resolvePath: jest.fn().mockReturnValue(FIXTURE_ROOT) };

    service = new ImpactService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      symbols as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      edges as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      repositoriesService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workspace as any,
    );
  });

  describe('symbol resolution', () => {
    it('resolves by symbolId directly, skipping the name lookup', async () => {
      symbols.findOneBy.mockResolvedValue(symbol({ id: 'exact-id' }));
      edges.find.mockResolvedValue([]);

      const result = await service.getImpact('repo-id', { symbolId: 'exact-id' });

      expect(symbols.findOneBy).toHaveBeenCalledWith({ id: 'exact-id', repositoryId: 'repo-id' });
      expect(symbols.findBy).not.toHaveBeenCalled();
      expect(result.symbol.id).toBe('exact-id');
    });

    it('throws NotFound for an unknown symbolId', async () => {
      symbols.findOneBy.mockResolvedValue(null);

      await expect(service.getImpact('repo-id', { symbolId: 'missing' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('resolves by qualified name when it matches exactly one symbol', async () => {
      symbols.findBy.mockResolvedValue([symbol({ qualifiedName: 'Foo.bar' })]);
      edges.find.mockResolvedValue([]);

      const result = await service.getImpact('repo-id', { symbol: 'Foo.bar' });

      expect(result.symbol.qualifiedName).toBe('Foo.bar');
    });

    it('throws NotFound when the qualified name matches nothing', async () => {
      symbols.findBy.mockResolvedValue([]);

      await expect(service.getImpact('repo-id', { symbol: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws AmbiguousSymbolException listing every match when the name is not unique', async () => {
      const matches = [
        symbol({ id: 'a', filePath: 'src/a.ts' }),
        symbol({ id: 'b', filePath: 'src/b.ts' }),
      ];
      symbols.findBy.mockResolvedValue(matches);

      const error: AmbiguousSymbolException = await service
        .getImpact('repo-id', { symbol: 'Foo' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(AmbiguousSymbolException);
      const response = error.getResponse() as { candidates: Array<{ id: string }> };
      expect(response.candidates.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('rejects when neither symbol nor symbolId is given', async () => {
      await expect(service.getImpact('repo-id', {})).rejects.toThrow(BadRequestException);
    });

    it('rejects when both symbol and symbolId are given', async () => {
      await expect(
        service.getImpact('repo-id', { symbol: 'Foo', symbolId: 'id-1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('caller traversal', () => {
    beforeEach(() => {
      symbols.findOneBy.mockResolvedValue(symbol({ id: 'target', filePath: 'src/target.ts' }));
    });

    it('walks multiple levels, tagging each caller with its hop count', async () => {
      const direct = symbol({ id: 'direct', qualifiedName: 'Direct', filePath: 'src/a/direct.ts' });
      const transitive = symbol({
        id: 'transitive',
        qualifiedName: 'Transitive',
        filePath: 'src/b/transitive.ts',
      });

      edges.find
        .mockResolvedValueOnce([{ fromSymbolId: 'direct', toSymbolId: 'target', kind: 'calls' }])
        .mockResolvedValueOnce([
          { fromSymbolId: 'transitive', toSymbolId: 'direct', kind: 'calls' },
        ])
        .mockResolvedValueOnce([]);
      symbols.find.mockResolvedValueOnce([direct]).mockResolvedValueOnce([transitive]);

      const result = await service.getImpact('repo-id', { symbolId: 'target', depth: 5 });

      expect(result.callers).toEqual([
        { symbol: expect.objectContaining({ id: 'direct' }), depth: 1 },
        { symbol: expect.objectContaining({ id: 'transitive' }), depth: 2 },
      ]);
    });

    it('stops at the requested depth even if more callers exist beyond it', async () => {
      const direct = symbol({ id: 'direct', filePath: 'src/direct.ts' });
      edges.find.mockResolvedValueOnce([
        { fromSymbolId: 'direct', toSymbolId: 'target', kind: 'calls' },
      ]);
      symbols.find.mockResolvedValueOnce([direct]);

      const result = await service.getImpact('repo-id', { symbolId: 'target', depth: 1 });

      expect(result.callers).toHaveLength(1);
      expect(edges.find).toHaveBeenCalledTimes(1);
    });

    it('does not loop forever or duplicate a symbol on a caller cycle', async () => {
      const a = symbol({ id: 'a', filePath: 'src/a.ts' });
      const b = symbol({ id: 'b', filePath: 'src/b.ts' });

      // target <- a <- b <- a (cycle back to a, already visited)
      edges.find
        .mockResolvedValueOnce([{ fromSymbolId: 'a', toSymbolId: 'target', kind: 'calls' }])
        .mockResolvedValueOnce([{ fromSymbolId: 'b', toSymbolId: 'a', kind: 'calls' }])
        .mockResolvedValueOnce([{ fromSymbolId: 'a', toSymbolId: 'b', kind: 'calls' }]);
      symbols.find.mockResolvedValueOnce([a]).mockResolvedValueOnce([b]);

      const result = await service.getImpact('repo-id', { symbolId: 'target', depth: 10 });

      expect(result.callers.map((c) => c.symbol.id)).toEqual(['a', 'b']);
      // 3rd call finds the a->b edge back, but `a` is already visited, so
      // nextIds is empty and the loop breaks WITHOUT a 4th find() call.
      expect(edges.find).toHaveBeenCalledTimes(3);
    });

    it('derives distinct, sorted affected modules from caller file paths', async () => {
      edges.find
        .mockResolvedValueOnce([
          { fromSymbolId: 'x', toSymbolId: 'target', kind: 'calls' },
          { fromSymbolId: 'y', toSymbolId: 'target', kind: 'calls' },
          { fromSymbolId: 'z', toSymbolId: 'target', kind: 'calls' },
        ])
        .mockResolvedValueOnce([]);
      symbols.find.mockResolvedValueOnce([
        symbol({ id: 'x', filePath: 'src/search/search.service.ts' }),
        symbol({ id: 'y', filePath: 'src/search/search.controller.ts' }),
        symbol({ id: 'z', filePath: 'src/auth/auth.service.ts' }),
      ]);

      const result = await service.getImpact('repo-id', { symbolId: 'target', depth: 5 });

      expect(result.affectedModules).toEqual(['auth', 'search']);
    });
  });

  describe('related tests (filesystem convention)', () => {
    it('finds a co-located spec file for an affected file that has one', async () => {
      symbols.findOneBy.mockResolvedValue(
        symbol({ id: 'target', filePath: 'src/english-greeter.service.ts' }),
      );
      edges.find.mockResolvedValue([]);

      const result = await service.getImpact('repo-id', { symbolId: 'target' });

      expect(result.relatedTests).toEqual(['src/english-greeter.service.spec.ts']);
    });

    it('returns no related tests when no sibling spec file exists on disk', async () => {
      symbols.findOneBy.mockResolvedValue(symbol({ id: 'target', filePath: 'src/format-name.ts' }));
      edges.find.mockResolvedValue([]);

      const result = await service.getImpact('repo-id', { symbolId: 'target' });

      expect(result.relatedTests).toEqual([]);
    });
  });

  describe('listSymbols', () => {
    it('returns every symbol for the repository, sorted by qualified name', async () => {
      symbols.find.mockResolvedValue([
        symbol({ id: 'a', qualifiedName: 'A.one' }),
        symbol({ id: 'b', qualifiedName: 'B.two' }),
      ]);

      const result = await service.listSymbols('repo-id');

      expect(symbols.find).toHaveBeenCalledWith({
        where: { repositoryId: 'repo-id' },
        order: { qualifiedName: 'ASC' },
      });
      expect(result.map((s) => s.qualifiedName)).toEqual(['A.one', 'B.two']);
    });

    it('propagates NotFoundException for an unknown repository, without querying symbols', async () => {
      repositoriesService.findOne.mockRejectedValue(new NotFoundException('nope'));

      await expect(service.listSymbols('missing-repo')).rejects.toThrow(NotFoundException);
      expect(symbols.find).not.toHaveBeenCalled();
    });
  });
});
