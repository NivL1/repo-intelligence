import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('database.url'),
        ssl: config.get<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        // Migrations are the source of truth for schema changes — never
        // rely on synchronize outside a throwaway local sandbox.
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
