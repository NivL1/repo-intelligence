/**
 * Retrieval quality metrics.
 *
 * Pure functions over "what we expected" and "what came back, in rank
 * order" — no database, no embeddings — so the scoring itself can be
 * tested. If the harness ever reports an improvement, the arithmetic
 * behind that claim needs to be something a reader can check.
 */

export interface EvalQuestion {
  id: string;
  question: string;
  /** Qualified names that a correct answer needs in front of it. */
  expect: string[];
  /** Why these are the right answers — read by humans, ignored by the scorer. */
  note?: string;
}

export interface QuestionScore {
  id: string;
  question: string;
  expected: string[];
  /** Qualified names actually retrieved, best-ranked first, truncated to k. */
  retrieved: string[];
  hits: string[];
  missing: string[];
  recall: number;
  /** 1/rank of the first expected name; 0 if none appeared within k. */
  reciprocalRank: number;
}

export interface Aggregate {
  questions: number;
  recall: number;
  mrr: number;
}

/**
 * Scores one question's ranked results against its ground truth.
 *
 * `retrieved` is deduplicated first, keeping each name's best rank — the
 * same symbol can legitimately arrive from two retrieval sources, and
 * counting it twice would inflate the ranks of everything after it.
 */
export function scoreQuestion(
  question: EvalQuestion,
  retrieved: (string | null)[],
  k: number,
): QuestionScore {
  if (question.expect.length === 0) {
    throw new Error(`question "${question.id}" has no expected symbols to score against`);
  }

  const ranked = [...new Set(retrieved.filter((name): name is string => Boolean(name)))].slice(
    0,
    k,
  );
  const expected = new Set(question.expect);
  const rankedSet = new Set(ranked);

  const hits = ranked.filter((name) => expected.has(name));
  const firstHitIndex = ranked.findIndex((name) => expected.has(name));

  return {
    id: question.id,
    question: question.question,
    expected: question.expect,
    retrieved: ranked,
    hits,
    missing: question.expect.filter((name) => !rankedSet.has(name)),
    recall: hits.length / question.expect.length,
    reciprocalRank: firstHitIndex === -1 ? 0 : 1 / (firstHitIndex + 1),
  };
}

/**
 * Macro-averaged: every question counts equally, regardless of how many
 * symbols its ground truth names. The alternative (pooling all expected
 * symbols first) would let one question with six expected hits outweigh
 * three questions with one each, which isn't what "average question" means.
 */
export function aggregate(scores: QuestionScore[]): Aggregate {
  if (scores.length === 0) {
    return { questions: 0, recall: 0, mrr: 0 };
  }

  return {
    questions: scores.length,
    recall: mean(scores.map((s) => s.recall)),
    mrr: mean(scores.map((s) => s.reciprocalRank)),
  };
}

/**
 * Ground-truth entries naming a symbol that isn't in the index at all.
 *
 * These are broken test cases, not retrieval failures, and the difference
 * matters: a typo'd expectation scores zero forever and would quietly drag
 * the reported numbers down while looking like a real miss. The harness
 * reports them separately rather than scoring them.
 */
export function findUnindexedExpectations(
  questions: EvalQuestion[],
  indexedNames: Set<string>,
): { id: string; unknown: string[] }[] {
  return questions
    .map((q) => ({ id: q.id, unknown: q.expect.filter((name) => !indexedNames.has(name)) }))
    .filter((entry) => entry.unknown.length > 0);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
