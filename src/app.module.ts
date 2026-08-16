import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, validateEnv } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { IndexingModule } from './indexing/indexing.module';
import { ImpactModule } from './impact/impact.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    RedisModule,
    UsersModule,
    AuthModule,
    HealthModule,
    EmbeddingsModule,
    RepositoriesModule,
    IndexingModule,
    ImpactModule,
  ],
})
export class AppModule {}
