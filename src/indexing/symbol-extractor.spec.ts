import { join } from 'path';
import { ExtractedSymbol, SymbolExtractor } from './symbol-extractor';

const FIXTURE_ROOT = join(__dirname, '../../test/fixtures/symbol-extraction');
const TSCONFIG = join(FIXTURE_ROOT, 'tsconfig.json');

describe('SymbolExtractor', () => {
  const { symbols, edges, chunks } = new SymbolExtractor().extract(FIXTURE_ROOT, TSCONFIG);

  const byQualifiedName = (name: string): ExtractedSymbol => {
    const found = symbols.find((s) => s.qualifiedName === name);
    if (!found) throw new Error(`no symbol found with qualifiedName "${name}"`);
    return found;
  };

  it('extracts classes, interfaces, methods and top-level functions', () => {
    expect(byQualifiedName('EnglishGreeterService').kind).toBe('class');
    expect(byQualifiedName('Greeter').kind).toBe('interface');
    expect(byQualifiedName('EnglishGreeterService.greet').kind).toBe('method');
    expect(byQualifiedName('formatName').kind).toBe('function');
  });

  it('records file paths relative to the repo root, not absolute', () => {
    expect(byQualifiedName('EnglishGreeterService').filePath).toBe(
      'src/english-greeter.service.ts',
    );
  });

  it('finds the implements edge', () => {
    const from = byQualifiedName('EnglishGreeterService');
    const to = byQualifiedName('Greeter');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'implements' });
  });

  it('finds the extends edge', () => {
    const from = byQualifiedName('EnglishGreeterService');
    const to = byQualifiedName('BaseGreeter');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'extends' });
  });

  it('finds the constructor injection edge', () => {
    const from = byQualifiedName('GreetingController');
    const to = byQualifiedName('EnglishGreeterService');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'injects' });
  });

  it('finds a cross-file method call edge', () => {
    const from = byQualifiedName('GreetingController.handle');
    const to = byQualifiedName('EnglishGreeterService.greet');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'calls' });
  });

  it('finds a call to a top-level function', () => {
    const from = byQualifiedName('GreetingController.handle');
    const to = byQualifiedName('formatName');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'calls' });
  });

  it('finds an internal private-method call', () => {
    const from = byQualifiedName('EnglishGreeterService.greet');
    const to = byQualifiedName('EnglishGreeterService.formatGreeting');
    expect(edges).toContainEqual({ fromKey: from.key, toKey: to.key, kind: 'calls' });
  });

  it('excludes .spec.ts files from extraction', () => {
    expect(symbols.some((s) => s.qualifiedName === 'buildService')).toBe(false);
  });

  describe('chunks', () => {
    const chunkFor = (symbolKey: string) => {
      const found = chunks.find((c) => c.symbolKey === symbolKey);
      if (!found) throw new Error(`no chunk found for symbolKey "${symbolKey}"`);
      return found;
    };

    it('emits one chunk per method, function and interface', () => {
      expect(chunkFor(byQualifiedName('EnglishGreeterService.greet').key)).toBeDefined();
      expect(chunkFor(byQualifiedName('formatName').key)).toBeDefined();
      expect(chunkFor(byQualifiedName('Greeter').key)).toBeDefined();
    });

    it('does not emit a chunk for classes themselves', () => {
      const classKey = byQualifiedName('EnglishGreeterService').key;
      expect(chunks.some((c) => c.symbolKey === classKey)).toBe(false);
    });

    it('includes the leading JSDoc comment in the chunk content', () => {
      const chunk = chunkFor(byQualifiedName('EnglishGreeterService.greet').key);
      expect(chunk.content).toContain('Greets a person by their first name only, in English.');
    });

    it('prefixes content with a file/qualified-name header', () => {
      const chunk = chunkFor(byQualifiedName('formatName').key);
      expect(chunk.content.split('\n')[0]).toBe('// src/format-name.ts — formatName');
    });

    it('records the declaration line range, not the JSDoc-inclusive one', () => {
      const symbol = byQualifiedName('EnglishGreeterService.greet');
      const chunk = chunkFor(symbol.key);
      expect(chunk.startLine).toBe(symbol.startLine);
      expect(chunk.endLine).toBe(symbol.endLine);
    });
  });
});
