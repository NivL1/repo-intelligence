import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../interfaces/llm-provider.interface';

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Calls OpenAI's chat completions API directly via fetch (no SDK dependency). */
@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  constructor(private readonly config: ConfigService) {}

  async complete(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('llm.openaiApiKey');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
    }
    const model = this.config.get<string>('llm.openaiModel') ?? 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI completion request failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OpenAiChatResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI completion response contained no content');
    }
    return content;
  }
}
