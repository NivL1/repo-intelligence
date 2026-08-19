import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toVectorLiteral } from '../database/vector-literal';
import { EmbeddingCacheService } from '../embeddings/embedding-cache.service';
import { RetrievalOptions, RetrievedChunk } from './retrieval.types';

const DEFAULT_LIMIT = 10;
// Matches bare identifiers and dotted qualified names ("search",
// "SearchService.search") so a question that names a real symbol gets an
// exact hit, not just whatever vector similarity happens to surface.
const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g;

interface VectorRow {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolId: string | null;
  qualifiedName: string | null;
  distance: number;
}

interface SymbolRow {
  id: string;
  qualifiedName: string;
}

interface EdgeRow {
  toSymbolId: string;
}

interface ChunkRow {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolId: string;
  qualifiedName: string | null;
}

/**
 * Hybrid retrieval: vector similarity (fuzzy, conceptual) blended with
 * exact symbol-name matches (precise, structural) and one hop of outgoing
 * `calls` edges from whatever EITHER of those found — pulls in code a
 * pure vector search would miss because it doesn't share the query's
 * words (e.g. the cache layer behind a service method the query names).
 *
 * "Either" is deliberate, not an oversight: graph expansion seeds off
 * vector hits too, not just exact symbol matches. This is the actual
 * headline case — a vector-only hit like `SearchService.search` for
 * "how does semantic search work?" is exactly the kind of result that
 * should pull in what it calls, even though nothing else in the answer
 * shares the query's words. Narrowing this to symbol-matches-only would
 * quietly break that case.
 *
 * Merge priority when the combined count exceeds `limit`: exact symbol
 * matches first — including one found by vector search too, re-tagged
 * rather than left to compete on distance — then their one-hop callees,
 * then plain vector hits by ascending distance. A truncation that dropped
 * the exact-name match in favour of a weak vector hit would defeat the
 * point of having it.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly embeddings: EmbeddingCacheService,
  ) {}

  async retrieve(
    repositoryId: string,
    question: string,
    limit = DEFAULT_LIMIT,
    options: RetrievalOptions = {},
  ): Promise<RetrievedChunk[]> {
    const embedding = await this.embeddings.embed(question);

    const vectorRows = await this.dataSource.query<VectorRow[]>(
      `SELECT c.id, c.content, c.file_path AS "filePath", c.start_line AS "startLine",
              c.end_line AS "endLine", c.symbol_id AS "symbolId", s.qualified_name AS "qualifiedName",
              c.embedding <=> $1::vector AS distance
       FROM chunks c
       LEFT JOIN symbols s ON s.id = c.symbol_id
       WHERE c.repository_id = $2
       ORDER BY distance
       LIMIT $3`,
      [toVectorLiteral(embedding), repositoryId, limit],
    );

    if (options.vectorOnly) {
      return vectorRows.map(toVectorChunk).slice(0, limit);
    }

    const tokens = [...new Set(question.match(IDENTIFIER_PATTERN) ?? [])];
    const symbolMatches = tokens.length
      ? await this.dataSource.query<SymbolRow[]>(
          `SELECT id, qualified_name AS "qualifiedName"
           FROM symbols
           WHERE repository_id = $1 AND (qualified_name = ANY($2) OR name = ANY($2))`,
          [repositoryId, tokens],
        )
      : [];

    const alreadyCovered = new Set(vectorRows.map((r) => r.symbolId).filter(Boolean));
    const seedSymbolIds = [
      ...new Set([...alreadyCovered, ...symbolMatches.map((s) => s.id)] as string[]),
    ];
    const edgeRows = seedSymbolIds.length
      ? await this.dataSource.query<EdgeRow[]>(
          `SELECT DISTINCT to_symbol_id AS "toSymbolId"
           FROM edges
           WHERE repository_id = $1 AND kind = 'calls' AND from_symbol_id = ANY($2)`,
          [repositoryId, seedSymbolIds],
        )
      : [];

    const symbolMatchIds = new Set(symbolMatches.map((s) => s.id));
    const neededIds = [
      ...new Set(
        [...symbolMatchIds, ...edgeRows.map((e) => e.toSymbolId)].filter(
          (id) => !alreadyCovered.has(id),
        ),
      ),
    ];
    const extraChunks = neededIds.length
      ? await this.dataSource.query<ChunkRow[]>(
          `SELECT c.id, c.content, c.file_path AS "filePath", c.start_line AS "startLine",
                  c.end_line AS "endLine", c.symbol_id AS "symbolId", s.qualified_name AS "qualifiedName"
           FROM chunks c
           LEFT JOIN symbols s ON s.id = c.symbol_id
           WHERE c.repository_id = $1 AND c.symbol_id = ANY($2)`,
          [repositoryId, neededIds],
        )
      : [];

    // A vector hit whose symbol is ALSO an exact name match must not be
    // judged by distance alongside plain vector noise — it earned its
    // priority the same way a freshly-fetched exact match did, and
    // `alreadyCovered` only kept it out of extraChunks to avoid fetching
    // its chunk twice, not to demote it. Splitting vectorRows here is what
    // makes that distinction survive into the merge below; without it, an
    // exact-name query for a symbol vector search also happens to surface
    // can get that very symbol truncated away by lower-value graph hits.
    const vectorExact = vectorRows.filter((r) => r.symbolId && symbolMatchIds.has(r.symbolId));
    // Named to avoid colliding with the `options.vectorOnly` ablation flag
    // above — same word, unrelated meaning, and a rename here means a
    // future reader (or a refactor that moves this below the flag's own
    // read) can't mistake one for the other.
    const plainVectorRows = vectorRows.filter(
      (r) => !r.symbolId || !symbolMatchIds.has(r.symbolId),
    );

    // Symbol-exact hits before graph-expansion hits before vector hits —
    // see the class doc comment on why this order matters for truncation.
    const prioritized: RetrievedChunk[] = [
      ...extraChunks
        .filter((c) => symbolMatchIds.has(c.symbolId))
        .map((c) => toRetrievedChunk(c, 'symbol')),
      ...vectorExact.map((r) => ({ ...toVectorChunk(r), source: 'symbol' as const })),
      ...extraChunks
        .filter((c) => !symbolMatchIds.has(c.symbolId))
        .map((c) => toRetrievedChunk(c, 'graph')),
      ...plainVectorRows.map(toVectorChunk),
    ];

    const seen = new Set<string>();
    const deduped = prioritized.filter((chunk) => {
      if (seen.has(chunk.id)) return false;
      seen.add(chunk.id);
      return true;
    });

    return deduped.slice(0, limit);
  }
}

function toVectorChunk(row: VectorRow): RetrievedChunk {
  return {
    id: row.id,
    content: row.content,
    filePath: row.filePath,
    startLine: row.startLine,
    endLine: row.endLine,
    qualifiedName: row.qualifiedName,
    source: 'vector',
    distance: row.distance,
  };
}

function toRetrievedChunk(row: ChunkRow, source: ChunkSourceExtra): RetrievedChunk {
  return {
    id: row.id,
    content: row.content,
    filePath: row.filePath,
    startLine: row.startLine,
    endLine: row.endLine,
    qualifiedName: row.qualifiedName,
    source,
  };
}

type ChunkSourceExtra = 'symbol' | 'graph';
