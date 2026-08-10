import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsProvider } from '../interfaces/embeddings-provider.interface';

interface OpenAiEmbeddingsResponse {
  data: { embedding: number[] }[];
}

/**
 * Calls OpenAI's embeddings API directly via fetch (no SDK dependency).
 * text-embedding-3-small outputs 1536 dims by default — EMBEDDING_DIMENSIONS
 * must match, or the pgvector insert will fail.
 */
@Injectable()
export class OpenAiEmbeddingsProvider implements EmbeddingsProvider {
  constructor(private readonly config: ConfigService) {}

  async embed(text: string): Promise<number[]> {
    const apiKey = this.config.get<string>('embeddings.openaiApiKey');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when EMBEDDINGS_PROVIDER=openai');
    }
    const model = this.config.get<string>('embeddings.openaiModel') ?? 'text-embedding-3-small';

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text, model }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI embeddings request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OpenAiEmbeddingsResponse;
    if (!body.data?.[0]) {
      throw new Error('OpenAI embeddings response contained no data');
    }
    return body.data[0].embedding;
  }
}
