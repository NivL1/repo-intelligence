import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeSymbol } from '../indexing/entities/symbol.entity';
import { RepositoriesModule } from '../repositories/repositories.module';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

@Module({
  imports: [TypeOrmModule.forFeature([CodeSymbol]), RepositoriesModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
