import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

/**
 * Standalone DataSource used only by the TypeORM CLI
 * (npm run migration:generate / migration:run / migration:revert).
 * The running application uses TypeOrmModule.forRootAsync in
 * database.module.ts instead — kept in sync manually since the CLI
 * can't consume Nest's DI-based async config.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
