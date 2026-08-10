import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingCacheService } from './embedding-cache.service';
import { EMBEDDINGS_PROVIDER } from './embeddings.constants';
import { EmbeddingsProvider } from './interfaces/embeddings-provider.interface';
import { OllamaEmbeddingsProvider } from './providers/ollama-embeddings.provider';
import { OnnxEmbeddingsProvider } from './providers/onnx-embeddings.provider';
import { OpenAiEmbeddingsProvider } from './providers/openai-embeddings.provider';
import { StubEmbeddingsProvider } from './providers/stub-embeddings.provider';

@Global()
@Module({
  providers: [
    {
      provide: EMBEDDINGS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmbeddingsProvider => {
        const provider = config.get<string>('embeddings.provider');
        switch (provider) {
          case 'onnx':
            return new OnnxEmbeddingsProvider(config);
          case 'openai':
            return new OpenAiEmbeddingsProvider(config);
          case 'ollama':
            return new OllamaEmbeddingsProvider(config);
          case 'stub':
            return new StubEmbeddingsProvider(config);
          default:
            throw new Error(
              `Unsupported EMBEDDINGS_PROVIDER "${provider}" — expected "onnx", "openai", "ollama", or "stub".`,
            );
        }
      },
    },
    EmbeddingCacheService,
  ],
  exports: [EmbeddingCacheService],
})
export class EmbeddingsModule {}
