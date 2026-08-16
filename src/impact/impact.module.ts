import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepositoriesModule } from '../repositories/repositories.module';
import { Edge } from '../indexing/entities/edge.entity';
import { CodeSymbol } from '../indexing/entities/symbol.entity';
import { ImpactController } from './impact.controller';
import { ImpactService } from './impact.service';

@Module({
  imports: [TypeOrmModule.forFeature([CodeSymbol, Edge]), RepositoriesModule],
  controllers: [ImpactController],
  providers: [ImpactService],
})
export class ImpactModule {}
