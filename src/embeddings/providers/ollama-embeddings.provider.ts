import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsProvider } from '../interfaces/embeddings-provider.interface';

interface OllamaEmbeddingsResponse {
  embedding: number[];
}

/**
 * Calls a local (or self-hosted) Ollama server's /api/embeddings endpoint.
 * Free and private, but requires Ollama running with the model pulled
 * (`ollama pull nomic-embed-text`) — unlike the onnx provider, this is a
 * network call to a separate process. nomic-embed-text outputs 768 dims by
 * default — EMBEDDING_DIMENSIONS must match.
 */
@Injectable()
export class OllamaEmbeddingsProvider implements EmbeddingsProvider {
  constructor(private readonly config: ConfigService) {}

  async embed(text: string): Promise<number[]> {
    const baseUrl = this.config.get<string>('embeddings.ollamaBaseUrl') ?? 'http://localhost:11434';
    const model = this.config.get<string>('embeddings.ollamaModel') ?? 'nomic-embed-text';

    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embeddings request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OllamaEmbeddingsResponse;
    if (!body.embedding) {
      throw new Error('Ollama embeddings response contained no embedding field');
    }
    return body.embedding;
  }
}
