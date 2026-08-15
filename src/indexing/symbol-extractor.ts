import { relative } from 'path';
import { Injectable } from '@nestjs/common';
import {
  ClassDeclaration,
  FunctionDeclaration,
  MethodDeclaration,
  Node,
  Project,
  Symbol as TsMorphSymbol,
  SyntaxKind,
} from 'ts-morph';
import type { EdgeKind } from './entities/edge.entity';
import type { SymbolKind } from './entities/symbol.entity';

export interface ExtractedSymbol {
  /** Unique within a single extraction run; not a database id. */
  key: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ExtractedEdge {
  fromKey: string;
  toKey: string;
  kind: EdgeKind;
}

export interface ExtractionResult {
  symbols: ExtractedSymbol[];
  edges: ExtractedEdge[];
}

type CallableDeclaration = MethodDeclaration | FunctionDeclaration;

// Matches .spec.ts, .test.ts, .spec.tsx, .test.tsx — both Jest test-file
// conventions, not just the one this repo happens to use. Not delegated to
// the target's own tsconfig `exclude`: that field conventionally excludes
// directories (node_modules, dist), not same-folder spec files — this
// project's own tsconfig.json is a working example of exactly that, with
// no spec exclusion at all (only tsconfig.build.json's separate, build-only
// exclude list has one).
const TEST_FILE_PATTERN = /\.(spec|test)\.tsx?$/;

/**
 * Parses a TypeScript project with the compiler (via ts-morph) into a flat
 * list of symbols and the edges between them. No database dependency —
 * pure in, pure out — so it's testable against a fixture project with no
 * NestJS bootstrap or Postgres involved.
 *
 * Deliberately narrow for v1: top-level classes, their methods, top-level
 * functions, and interfaces — not arrow-function-as-const, nested
 * functions, or namespaces. NestJS services are always classes, so this
 * covers the primary case; broadening it is a v0.2+ decision, not a bug.
 *
 * Cross-file resolution of LOCAL declarations (the actual call graph)
 * works even if the target repo has never had `npm install` run — the TS
 * checker binds local symbols independent of whether external package
 * types resolve. Decorator metadata and library-typed signatures may be
 * less precise without node_modules present, but that's not something v1
 * depends on.
 */
@Injectable()
export class SymbolExtractor {
  extract(repoRoot: string, tsConfigFilePath: string): ExtractionResult {
    const project = new Project({ tsConfigFilePath });

    const symbols: ExtractedSymbol[] = [];
    const nodeToKey = new Map<Node, string>();
    const callables: CallableDeclaration[] = [];
    const classes: ClassDeclaration[] = [];

    for (const file of project.getSourceFiles()) {
      const filePath = file.getFilePath();
      if (
        file.isDeclarationFile() ||
        filePath.includes('node_modules') ||
        TEST_FILE_PATTERN.test(filePath)
      ) {
        continue;
      }

      const relativePath = relative(repoRoot, filePath);

      for (const cls of file.getClasses()) {
        const className = cls.getName();
        if (!className) continue; // anonymous default-export class: out of scope for v1
        this.register(symbols, nodeToKey, cls, className, className, 'class', relativePath);
        classes.push(cls);

        for (const method of cls.getMethods()) {
          const methodName = method.getName();
          const qualifiedName = `${className}.${methodName}`;
          this.register(
            symbols,
            nodeToKey,
            method,
            methodName,
            qualifiedName,
            'method',
            relativePath,
          );
          callables.push(method);
        }
      }

      for (const iface of file.getInterfaces()) {
        const name = iface.getName();
        this.register(symbols, nodeToKey, iface, name, name, 'interface', relativePath);
      }

      for (const fn of file.getFunctions()) {
        const name = fn.getName();
        if (!name) continue;
        this.register(symbols, nodeToKey, fn, name, name, 'function', relativePath);
        callables.push(fn);
      }
    }

    const edges = dedupeEdges([
      ...this.extractCallEdges(callables, nodeToKey),
      ...this.extractHeritageEdges(classes, nodeToKey),
      ...this.extractInjectionEdges(classes, nodeToKey),
    ]);

    return { symbols, edges };
  }

  private register(
    symbols: ExtractedSymbol[],
    nodeToKey: Map<Node, string>,
    node: Node,
    name: string,
    qualifiedName: string,
    kind: SymbolKind,
    filePath: string,
  ): void {
    const startLine = node.getStartLineNumber();
    // filePath + qualifiedName alone would collide on legitimate method
    // overloads (same signature name declared twice); the line makes every
    // key unique without needing a database id yet.
    const key = `${filePath}#${qualifiedName}#${startLine}`;
    nodeToKey.set(node, key);
    symbols.push({
      key,
      name,
      qualifiedName,
      kind,
      filePath,
      startLine,
      endLine: node.getEndLineNumber(),
    });
  }

  private extractCallEdges(
    callables: CallableDeclaration[],
    nodeToKey: Map<Node, string>,
  ): ExtractedEdge[] {
    const edges: ExtractedEdge[] = [];
    for (const callable of callables) {
      const fromKey = nodeToKey.get(callable);
      if (!fromKey) continue;

      for (const call of callable.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const declaration = this.resolveDeclaration(call.getExpression().getSymbol());
        const toKey = declaration && nodeToKey.get(declaration);
        // Calls to unresolved symbols (external libraries, calls the
        // checker can't bind) are silently skipped rather than recorded as
        // partial edges — an edge with no real "to" isn't useful data.
        if (toKey && toKey !== fromKey) {
          edges.push({ fromKey, toKey, kind: 'calls' });
        }
      }
    }
    return edges;
  }

  private extractHeritageEdges(
    classes: ClassDeclaration[],
    nodeToKey: Map<Node, string>,
  ): ExtractedEdge[] {
    const edges: ExtractedEdge[] = [];
    for (const cls of classes) {
      const fromKey = nodeToKey.get(cls);
      if (!fromKey) continue;

      const extendsClause = cls.getExtends();
      if (extendsClause) {
        const declaration = this.resolveDeclaration(extendsClause.getExpression().getSymbol());
        const toKey = declaration && nodeToKey.get(declaration);
        if (toKey) edges.push({ fromKey, toKey, kind: 'extends' });
      }

      for (const impl of cls.getImplements()) {
        const declaration = this.resolveDeclaration(impl.getExpression().getSymbol());
        const toKey = declaration && nodeToKey.get(declaration);
        if (toKey) edges.push({ fromKey, toKey, kind: 'implements' });
      }
    }
    return edges;
  }

  /**
   * NestJS constructor injection: `constructor(private readonly x: Foo)`.
   * Only parameters with an accessibility or readonly modifier count —
   * that's what makes a constructor parameter a class property in
   * TypeScript, and it's the convention Nest's DI container relies on. A
   * plain parameter with no modifier is just an argument, not a dependency.
   */
  private extractInjectionEdges(
    classes: ClassDeclaration[],
    nodeToKey: Map<Node, string>,
  ): ExtractedEdge[] {
    const edges: ExtractedEdge[] = [];
    for (const cls of classes) {
      const fromKey = nodeToKey.get(cls);
      if (!fromKey) continue;

      const ctor = cls.getConstructors()[0];
      if (!ctor) continue;

      for (const param of ctor.getParameters()) {
        const isProperty =
          param.hasModifier(SyntaxKind.PublicKeyword) ||
          param.hasModifier(SyntaxKind.PrivateKeyword) ||
          param.hasModifier(SyntaxKind.ProtectedKeyword) ||
          param.hasModifier(SyntaxKind.ReadonlyKeyword);
        if (!isProperty) continue;

        const declaration = this.resolveDeclaration(param.getType().getSymbol());
        const toKey = declaration && nodeToKey.get(declaration);
        if (toKey) edges.push({ fromKey, toKey, kind: 'injects' });
      }
    }
    return edges;
  }

  /**
   * A reference to an imported name (`extends BaseGreeter`, a bare
   * `formatName()` call) resolves via the checker to the import's ALIAS
   * symbol, whose only "declaration" is the import specifier itself — not
   * the real one. Property-access calls (`this.foo.bar()`) don't hit this,
   * because they resolve through the type's member table instead of an
   * identifier's alias chain. Following the alias here makes both paths
   * land on the same original declaration.
   */
  private resolveDeclaration(symbol: TsMorphSymbol | undefined): Node | undefined {
    if (!symbol) return undefined;
    const target = symbol.getAliasedSymbol() ?? symbol;
    return target.getDeclarations()[0];
  }
}

function dedupeEdges(edges: ExtractedEdge[]): ExtractedEdge[] {
  const seen = new Set<string>();
  const result: ExtractedEdge[] = [];
  for (const edge of edges) {
    const dedupeKey = `${edge.fromKey}|${edge.toKey}|${edge.kind}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(edge);
  }
  return result;
}
