import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoriesModule } from '../repositories/repositories.module';
import { Edge } from './entities/edge.entity';
import { CodeSymbol } from './entities/symbol.entity';
import { IndexingController } from './indexing.controller';
import { IndexingService } from './indexing.service';
import { SymbolExtractor } from './symbol-extractor';

@Module({
  imports: [TypeOrmModule.forFeature([CodeSymbol, Edge]), RepositoriesModule],
  controllers: [IndexingController],
  providers: [IndexingService, SymbolExtractor],
})
export class IndexingModule {}
