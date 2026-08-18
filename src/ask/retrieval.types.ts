export type ChunkSource = 'vector' | 'symbol' | 'graph';

export interface RetrievedChunk {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  qualifiedName: string | null;
  source: ChunkSource;
  /** Only present for vector-sourced hits — cosine distance, lower is closer. */
  distance?: number;
}
