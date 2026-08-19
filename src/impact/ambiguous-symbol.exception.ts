import { HttpException, HttpStatus } from '@nestjs/common';
import { CodeSymbol } from '../indexing/entities/symbol.entity';

/**
 * symbols.qualified_name is deliberately not unique (see CreateCodeGraphTables
 * migration) — overloads and same-named symbols in different files legitimately
 * collide. Rather than guessing, this surfaces every match so the caller can
 * retry with an unambiguous symbolId.
 */
export class AmbiguousSymbolException extends HttpException {
  constructor(qualifiedName: string, candidates: CodeSymbol[]) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: `"${qualifiedName}" matches ${candidates.length} symbols — retry with symbolId to disambiguate`,
        candidates: candidates.map((c) => ({
          id: c.id,
          qualifiedName: c.qualifiedName,
          kind: c.kind,
          filePath: c.filePath,
          startLine: c.startLine,
        })),
      },
      HttpStatus.CONFLICT,
    );
  }
}
