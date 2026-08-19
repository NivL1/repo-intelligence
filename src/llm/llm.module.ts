import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './interfaces/llm-provider.interface';
import { LlmCacheService } from './llm-cache.service';
import { LLM_PROVIDER } from './llm.constants';
import { OllamaLlmProvider } from './providers/ollama-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';
import { StubLlmProvider } from './providers/stub-llm.provider';

@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const provider = config.get<string>('llm.provider');
        switch (provider) {
          case 'ollama':
            return new OllamaLlmProvider(config);
          case 'openai':
            return new OpenAiLlmProvider(config);
          case 'stub':
            return new StubLlmProvider();
          default:
            throw new Error(
              `Unsupported LLM_PROVIDER "${provider}" — expected "ollama", "openai", or "stub".`,
            );
        }
      },
    },
    LlmCacheService,
  ],
  exports: [LlmCacheService],
})
export class LlmModule {}
