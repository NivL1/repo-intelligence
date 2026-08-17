import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(0)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsBoolean()
  @IsOptional()
  // `enableImplicitConversion` runs its own naive `Boolean(value)` coercion
  // before this decorator sees `value`, so "false" (any non-empty string)
  // already comes in as `true` by the time a `value`-based Transform would
  // run. Reading the untouched string straight off `obj` avoids that.
  @Transform(({ obj }) => obj.DATABASE_SSL === 'true')
  DATABASE_SSL: boolean = false;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_TTL: string = '900s';

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_TTL: string = '7d';

  @IsIn(['onnx', 'openai', 'ollama', 'stub'])
  @IsOptional()
  EMBEDDINGS_PROVIDER: string = 'onnx';

  @IsString()
  @IsOptional()
  ONNX_EMBEDDING_MODEL: string = 'Xenova/all-MiniLM-L6-v2';

  @IsString()
  @IsOptional()
  OPENAI_API_KEY: string = '';

  @IsString()
  @IsOptional()
  OPENAI_EMBEDDING_MODEL: string = 'text-embedding-3-small';

  @IsString()
  @IsOptional()
  OLLAMA_BASE_URL: string = 'http://localhost:11434';

  @IsString()
  @IsOptional()
  OLLAMA_EMBEDDING_MODEL: string = 'nomic-embed-text';

  // Must match the output size of whichever EMBEDDINGS_PROVIDER is active —
  // onnx/all-MiniLM-L6-v2: 384, openai/text-embedding-3-small: 1536,
  // ollama/nomic-embed-text: 768. Wrong value fails inserts into the
  // pgvector `documents.embedding` column (sized at migration time).
  @IsInt()
  @IsOptional()
  EMBEDDING_DIMENSIONS: number = 384;

  @IsInt()
  @IsOptional()
  EMBEDDING_CACHE_TTL_SECONDS: number = 2592000;

  @IsString()
  @IsOptional()
  WORKSPACE_DIR: string = './.workspace';

  // @xenova/transformers defaults its model cache to a directory INSIDE
  // node_modules/@xenova/transformers itself — root-owned in the Docker
  // image, so the non-root runtime user gets EACCES on first use and
  // silently re-downloads the ~90MB model on every restart instead of
  // caching it. Redirecting to an app-owned directory fixes that.
  @IsString()
  @IsOptional()
  ONNX_CACHE_DIR: string = './.cache';
}

/**
 * Validates process.env against EnvironmentVariables at boot time, so a
 * missing or malformed secret fails fast with a clear error instead of
 * surfacing as a confusing runtime crash three requests later.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {})).join('\n');
    throw new Error(`Config validation error:\n${messages}`);
  }

  return validated;
}

export interface AppConfig {
  env: string;
  port: number;
  database: { url: string; ssl: boolean };
  redis: { url: string };
  jwt: {
    accessSecret: string;
    accessTtl: string;
    refreshSecret: string;
    refreshTtl: string;
  };
  embeddings: {
    provider: string;
    onnxModel: string;
    onnxCacheDir: string;
    openaiApiKey: string;
    openaiModel: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    dimensions: number;
    cacheTtlSeconds: number;
  };
  workspaceDir: string;
}

export function configuration(): AppConfig {
  return {
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    database: {
      url: process.env.DATABASE_URL ?? '',
      ssl: process.env.DATABASE_SSL === 'true',
    },
    redis: {
      url: process.env.REDIS_URL ?? '',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    },
    embeddings: {
      provider: process.env.EMBEDDINGS_PROVIDER ?? 'onnx',
      onnxModel: process.env.ONNX_EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2',
      onnxCacheDir: process.env.ONNX_CACHE_DIR ?? './.cache',
      openaiApiKey: process.env.OPENAI_API_KEY ?? '',
      openaiModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      ollamaModel: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? '384', 10),
      cacheTtlSeconds: parseInt(process.env.EMBEDDING_CACHE_TTL_SECONDS ?? '2592000', 10),
    },
    workspaceDir: process.env.WORKSPACE_DIR ?? './.workspace',
  };
}
