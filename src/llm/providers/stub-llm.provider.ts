import { Injectable } from '@nestjs/common';
import { LlmProvider } from '../interfaces/llm-provider.interface';

/**
 * Deterministic, no-network provider for fast tests — mirrors
 * StubEmbeddingsProvider's role exactly. Not a real operating mode.
 */
@Injectable()
export class StubLlmProvider implements LlmProvider {
  complete(prompt: string): Promise<string> {
    return Promise.resolve(`[stub completion for a ${prompt.length}-character prompt]`);
  }
}
