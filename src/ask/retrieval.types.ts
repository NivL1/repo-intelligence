export type ChunkSource = 'vector' | 'symbol' | 'graph';

export interface RetrievalOptions {
  /**
   * Skip exact symbol matching and graph expansion, returning pure vector
   * similarity — the ablation baseline the eval harness measures the full
   * hybrid against.
   *
   * This lives in the production service on purpose rather than being
   * reimplemented in the harness: a baseline that drifted away from the
   * real query would make every reported improvement meaningless.
   */
  vectorOnly?: boolean;
}

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
