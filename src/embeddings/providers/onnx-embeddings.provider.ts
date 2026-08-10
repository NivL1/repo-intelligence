import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsProvider } from '../interfaces/embeddings-provider.interface';

type FeatureExtractionPipeline = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

/**
 * Runs a real sentence-embedding model locally via @xenova/transformers
 * (ONNX runtime, pure JS/WASM) — no API key, no network call per request,
 * free. Default model is Xenova/all-MiniLM-L6-v2 (384 dims); EMBEDDING_DIMENSIONS
 * must match whatever ONNX_EMBEDDING_MODEL actually outputs, or inserts into
 * the pgvector `documents.embedding` column will fail dimension checks.
 *
 * @xenova/transformers is ESM-only, so it's loaded via dynamic import()
 * from this CommonJS-compiled codebase. The pipeline itself downloads and
 * caches the model on first use (under `.cache/` by default) and is built
 * once per process, not per request.
 */
@Injectable()
export class OnnxEmbeddingsProvider implements EmbeddingsProvider {
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(private readonly config: ConfigService) {}

  async embed(text: string): Promise<number[]> {
    const pipeline = await this.getPipeline();
    const output = await pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      const model = this.config.get<string>('embeddings.onnxModel') ?? 'Xenova/all-MiniLM-L6-v2';
      this.pipelinePromise = import('@xenova/transformers').then(({ pipeline }) =>
        pipeline('feature-extraction', model),
      ) as Promise<FeatureExtractionPipeline>;
    }
    return this.pipelinePromise;
  }
}
