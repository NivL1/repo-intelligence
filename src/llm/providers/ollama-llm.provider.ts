import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../interfaces/llm-provider.interface';

interface OllamaGenerateResponse {
  response: string;
}

/**
 * Calls a local (or self-hosted) Ollama server's /api/generate endpoint.
 * Free and private, but requires Ollama running with the model pulled
 * (`ollama pull llama3.2`) — the default LLM_PROVIDER, same reasoning as
 * the embeddings pipeline: v0.1.0 shouldn't need a paid key to run `ask`.
 */
@Injectable()
export class OllamaLlmProvider implements LlmProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(prompt: string): Promise<string> {
    const baseUrl = this.config.get<string>('llm.ollamaBaseUrl') ?? 'http://localhost:11434';
    const model = this.config.get<string>('llm.ollamaModel') ?? 'llama3.2';

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama completion request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OllamaGenerateResponse;
    if (!body.response) {
      throw new Error('Ollama completion response contained no text');
    }
    return body.response;
  }
}
