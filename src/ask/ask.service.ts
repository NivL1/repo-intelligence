import { Injectable } from '@nestjs/common';
import { LlmCacheService } from '../llm/llm-cache.service';
import { RepositoriesService } from '../repositories/repositories.service';
import { AskResultDto } from './dto/ask-result.dto';
import { RetrievalService } from './retrieval.service';
import { RetrievedChunk } from './retrieval.types';

const NOTHING_FOUND_ANSWER =
  "I couldn't find anything in this repository related to that question — it may not be " +
  'indexed yet, or the answer may not be in the code.';

@Injectable()
export class AskService {
  constructor(
    private readonly repositoriesService: RepositoriesService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmCacheService,
  ) {}

  async ask(repositoryId: string, question: string): Promise<AskResultDto> {
    await this.repositoriesService.findOne(repositoryId); // throws NotFoundException if unknown

    const chunks = await this.retrieval.retrieve(repositoryId, question);
    if (chunks.length === 0) {
      // No retrieval, no LLM call: an honest "nothing found" beats
      // spending a completion on a prompt with no actual context in it.
      return { answer: NOTHING_FOUND_ANSWER, sources: [] };
    }

    const answer = await this.llm.complete(buildPrompt(question, chunks));

    return {
      answer,
      sources: chunks.map((chunk, i) => ({
        n: i + 1,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        qualifiedName: chunk.qualifiedName,
      })),
    };
  }
}

function buildPrompt(question: string, chunks: RetrievedChunk[]): string {
  const excerpts = chunks
    .map((chunk, i) => {
      const label = chunk.qualifiedName ? ` (${chunk.qualifiedName})` : '';
      return `[${i + 1}] ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}${label}\n${chunk.content}`;
    })
    .join('\n\n');

  return [
    'Answer the question using ONLY the code excerpts below. Cite the excerpt number',
    '(like [1]) for every claim you make. If the excerpts do not contain enough',
    'information to answer, say so plainly instead of guessing.',
    '',
    excerpts,
    '',
    `Question: ${question}`,
  ].join('\n');
}
