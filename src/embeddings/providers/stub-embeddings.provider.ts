import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsProvider } from '../interfaces/embeddings-provider.interface';

/**
 * Deterministic, dependency-free embeddings provider: the same text always
 * maps to the same vector, with no network call, no API key, and no model
 * download. The vector carries no real semantic meaning — it exists to
 * exercise the ingest / cache / pgvector-search pipeline end to end (e.g.
 * in CI, where downloading an ONNX model isn't worth the time). Use
 * EMBEDDINGS_PROVIDER=onnx/openai/ollama for anything beyond that.
 */
@Injectable()
export class StubEmbeddingsProvider implements EmbeddingsProvider {
  constructor(private readonly config: ConfigService) {}

  embed(text: string): Promise<number[]> {
    const dimensions = this.config.get<number>('embeddings.dimensions') ?? 1536;
    const seed = createHash('sha256').update(text).digest().readUInt32BE(0);
    const next = mulberry32(seed);

    const vector = Array.from({ length: dimensions }, () => next() * 2 - 1);
    return Promise.resolve(normalize(vector));
  }
}

// Small, fast, deterministic PRNG — good enough for a local stub, not for
// anything cryptographic. https://gist.github.com/tommyettinger/46a874533244883189143505d203312
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}
