import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [RepositoriesModule],
  controllers: [AskController],
  providers: [AskService, RetrievalService],
})
export class AskModule {}
