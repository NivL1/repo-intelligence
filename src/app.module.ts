import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration, validateEnv } from './config/configuration';
import { PublicConfigController } from './config/public-config.controller';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { IndexingModule } from './indexing/indexing.module';
import { ImpactModule } from './impact/impact.module';
import { MapModule } from './map/map.module';
import { LlmModule } from './llm/llm.module';
import { AskModule } from './ask/ask.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // A general safety net across the whole API, not specific to demo
    // mode — 60 req/min per IP. `ask` gets a much stricter override
    // (see AskController) since each call costs real LLM money and, in
    // demo mode, doesn't even require an account to reach.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthModule,
    HealthModule,
    EmbeddingsModule,
    RepositoriesModule,
    IndexingModule,
    ImpactModule,
    MapModule,
    LlmModule,
    AskModule,
    // Serves the dashboard's production build from the same origin and
    // port as the API — the Dockerfile builds client/ into a separate
    // stage and copies its output here (see the `client-builder` stage).
    // Only meaningful in that container: nothing builds client-dist for
    // a bare `npm run start:dev`, so this module quietly serves nothing
    // outside Docker, same as it does for any excluded API path.
    //
    // `exclude` is load-bearing, not decorative: ServeStaticModule
    // registers a catch-all GET '*' that renders index.html (the SPA
    // fallback client-side routing needs — a hard refresh on
    // /repos/:id has to still work), and without excluding every
    // existing API prefix that catch-all would intercept them before
    // their own controllers ever see the request.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client-dist'),
      exclude: [
        '/auth/(.*)',
        '/repositories/(.*)',
        '/health/(.*)',
        '/docs/(.*)',
        '/docs-json/(.*)',
        '/docs-yaml/(.*)',
        '/config/(.*)',
      ],
    }),
  ],
  controllers: [PublicConfigController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
