import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toVectorLiteral } from '../database/vector-literal';
import { EmbeddingCacheService } from '../embeddings/embedding-cache.service';
import { RetrievedChunk } from './retrieval.types';

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
 * `calls` edges from whatever either of those found — pulls in code a
 * pure vector search would miss because it doesn't share the query's
 * words (e.g. the cache layer behind a service method the query names).
 *
 * Merge priority when the combined count exceeds `limit`: exact symbol
 * matches first, then their one-hop callees, then vector hits by
 * ascending distance. A truncation that dropped the exact-name match in
 * favour of a weak vector hit would defeat the point of having it.
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

    // Symbol-exact hits before graph-expansion hits before vector hits —
    // see the class doc comment on why this order matters for truncation.
    const prioritized: RetrievedChunk[] = [
      ...extraChunks
        .filter((c) => symbolMatchIds.has(c.symbolId))
        .map((c) => toRetrievedChunk(c, 'symbol')),
      ...extraChunks
        .filter((c) => !symbolMatchIds.has(c.symbolId))
        .map((c) => toRetrievedChunk(c, 'graph')),
      ...vectorRows.map((r): RetrievedChunk => ({
        id: r.id,
        content: r.content,
        filePath: r.filePath,
        startLine: r.startLine,
        endLine: r.endLine,
        qualifiedName: r.qualifiedName,
        source: 'vector',
        distance: r.distance,
      })),
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
