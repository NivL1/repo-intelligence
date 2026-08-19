/**
 * Retrieval eval harness.
 *
 * Runs every question in questions.json twice against an indexed
 * repository — once through the full hybrid retrieval, once through
 * vector similarity alone — and reports recall@k and MRR for each.
 *
 * The point is to put a number on this project's central claim: that a
 * symbol graph on top of vector search retrieves better code than vector
 * search by itself. Both arms call the same production RetrievalService,
 * so the baseline can't drift away from the real query.
 *
 * No LLM is involved. This measures *retrieval*, not answer quality —
 * they're separate failure modes and conflating them makes both harder
 * to debug.
 *
 *   docker compose up -d
 *   npm run eval
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RetrievalService } from '../src/ask/retrieval.service';
import {
  aggregate,
  Aggregate,
  EvalQuestion,
  findUnindexedExpectations,
  scoreQuestion,
} from './metrics';

const K = 5;

interface QuestionFile {
  repository: string;
  questions: EvalQuestion[];
}

async function main(): Promise<number> {
  const file = JSON.parse(readFileSync(join(__dirname, 'questions.json'), 'utf8')) as QuestionFile;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const dataSource = app.get(DataSource);
    const retrieval = app.get(RetrievalService);

    const [repository] = (await dataSource.query(
      'SELECT id, name FROM repositories WHERE name = $1',
      [file.repository],
    )) as { id: string; name: string }[];

    if (!repository) {
      console.error(
        `No indexed repository named "${file.repository}".\n` +
          'Register and index it first:\n' +
          '  POST /repositories           {"source": "https://github.com/..."}\n' +
          '  POST /repositories/:id/index',
      );
      return 1;
    }

    const indexedNames = new Set(
      (
        (await dataSource.query(
          `SELECT DISTINCT s.qualified_name AS name
           FROM symbols s JOIN chunks c ON c.symbol_id = s.id
           WHERE s.repository_id = $1`,
          [repository.id],
        )) as { name: string }[]
      ).map((row) => row.name),
    );

    // Broken ground truth is a config error, not a retrieval result — say
    // so loudly instead of letting it score zero and drag the average down
    // while looking like a genuine miss.
    const broken = findUnindexedExpectations(file.questions, indexedNames);
    if (broken.length > 0) {
      console.error(`Ground truth names ${broken.length} symbol(s) that aren't in the index:\n`);
      for (const { id, unknown } of broken) {
        console.error(`  ${id}: ${unknown.join(', ')}`);
      }
      console.error('\nFix questions.json (or re-index) — refusing to report numbers built on it.');
      return 1;
    }

    console.log(`Repository: ${repository.name}  (${indexedNames.size} chunked symbols)`);
    console.log(`Questions:  ${file.questions.length}, measuring recall@${K} and MRR\n`);

    const hybrid = [];
    const vectorOnly = [];
    for (const question of file.questions) {
      hybrid.push(
        scoreQuestion(
          question,
          (await retrieval.retrieve(repository.id, question.question, K)).map(
            (c) => c.qualifiedName,
          ),
          K,
        ),
      );
      vectorOnly.push(
        scoreQuestion(
          question,
          (await retrieval.retrieve(repository.id, question.question, K, { vectorOnly: true })).map(
            (c) => c.qualifiedName,
          ),
          K,
        ),
      );
    }

    printPerQuestion(file.questions, hybrid, vectorOnly);
    printSummary(aggregate(hybrid), aggregate(vectorOnly));
    return 0;
  } finally {
    await app.close();
  }
}

function printPerQuestion(
  questions: EvalQuestion[],
  hybrid: ReturnType<typeof scoreQuestion>[],
  vectorOnly: ReturnType<typeof scoreQuestion>[],
): void {
  console.log(pad('question', 44) + pad('hybrid', 18) + 'vector-only');
  console.log(pad('', 44) + pad('recall  MRR', 18) + 'recall  MRR');
  console.log('-'.repeat(84));

  for (let i = 0; i < questions.length; i++) {
    const marker = hybrid[i].recall > vectorOnly[i].recall ? ' +' : '  ';
    console.log(
      pad(truncate(questions[i].question, 42), 44) +
        pad(`${fmt(hybrid[i].recall)}   ${fmt(hybrid[i].reciprocalRank)}`, 18) +
        `${fmt(vectorOnly[i].recall)}   ${fmt(vectorOnly[i].reciprocalRank)}${marker}`,
    );
  }
  console.log();
}

function printSummary(hybrid: Aggregate, vectorOnly: Aggregate): void {
  console.log('-'.repeat(84));
  console.log(
    pad(`mean over ${hybrid.questions} questions`, 44) +
      pad(`${fmt(hybrid.recall)}   ${fmt(hybrid.mrr)}`, 18) +
      `${fmt(vectorOnly.recall)}   ${fmt(vectorOnly.mrr)}`,
  );
  console.log(
    pad('hybrid − vector-only', 44) +
      `${signed(hybrid.recall - vectorOnly.recall)}  ${signed(hybrid.mrr - vectorOnly.mrr)}`,
  );
}

const pad = (text: string, width: number) => text.padEnd(width);
const fmt = (value: number) => value.toFixed(2);
const signed = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(2);
const truncate = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
