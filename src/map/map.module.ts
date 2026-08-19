import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Edge } from '../indexing/entities/edge.entity';
import { CodeSymbol } from '../indexing/entities/symbol.entity';
import { RepositoriesModule } from '../repositories/repositories.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [TypeOrmModule.forFeature([CodeSymbol, Edge]), RepositoriesModule],
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
