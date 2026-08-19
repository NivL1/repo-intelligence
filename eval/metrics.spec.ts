import { aggregate, EvalQuestion, findUnindexedExpectations, scoreQuestion } from './metrics';

describe('scoreQuestion', () => {
  const question = (expect: string[]): EvalQuestion => ({
    id: 'q1',
    question: 'how does it work?',
    expect,
  });

  it('scores a perfect retrieval as recall 1 and reciprocal rank 1', () => {
    const score = scoreQuestion(question(['A.one', 'B.two']), ['A.one', 'B.two'], 5);

    expect(score.recall).toBe(1);
    expect(score.reciprocalRank).toBe(1);
    expect(score.hits).toEqual(['A.one', 'B.two']);
    expect(score.missing).toEqual([]);
  });

  it('scores a complete miss as zero on both metrics', () => {
    const score = scoreQuestion(question(['A.one']), ['X.nope', 'Y.nope'], 5);

    expect(score.recall).toBe(0);
    expect(score.reciprocalRank).toBe(0);
    expect(score.missing).toEqual(['A.one']);
  });

  it('reports partial recall when only some expected symbols come back', () => {
    const score = scoreQuestion(question(['A.one', 'B.two', 'C.three']), ['A.one', 'C.three'], 5);

    expect(score.recall).toBeCloseTo(2 / 3);
    expect(score.missing).toEqual(['B.two']);
  });

  it('takes reciprocal rank from the first hit, not the best-recalled one', () => {
    const score = scoreQuestion(question(['C.three']), ['X.nope', 'Y.nope', 'C.three'], 5);

    expect(score.reciprocalRank).toBeCloseTo(1 / 3);
    expect(score.recall).toBe(1);
  });

  it('ignores anything ranked beyond k', () => {
    const score = scoreQuestion(question(['D.four']), ['a', 'b', 'c', 'D.four'], 3);

    expect(score.recall).toBe(0);
    expect(score.reciprocalRank).toBe(0);
    expect(score.retrieved).toEqual(['a', 'b', 'c']);
  });

  it('drops chunks with no qualified name rather than counting them as ranks', () => {
    // Chunks can have a null qualifiedName. Treating those as occupying a
    // rank would penalise a result that is actually correct at rank 1.
    const score = scoreQuestion(question(['A.one']), [null, 'A.one'], 5);

    expect(score.reciprocalRank).toBe(1);
    expect(score.retrieved).toEqual(['A.one']);
  });

  it('deduplicates repeated names, keeping the best rank', () => {
    // The same symbol can arrive from two retrieval sources. Counting it
    // twice would push everything after it down a rank it did not earn.
    const score = scoreQuestion(question(['B.two']), ['A.one', 'A.one', 'B.two'], 5);

    expect(score.retrieved).toEqual(['A.one', 'B.two']);
    expect(score.reciprocalRank).toBeCloseTo(1 / 2);
  });

  it('refuses to score a question with no ground truth', () => {
    // Silently scoring this as 0/0 would put a NaN into the average and
    // poison every number the harness reports.
    expect(() => scoreQuestion(question([]), ['A.one'], 5)).toThrow(/no expected symbols/);
  });
});

describe('aggregate', () => {
  const score = (recall: number, reciprocalRank: number) => ({
    id: 'x',
    question: 'q',
    expected: [],
    retrieved: [],
    hits: [],
    missing: [],
    recall,
    reciprocalRank,
  });

  it('macro-averages so every question counts equally', () => {
    const result = aggregate([score(1, 1), score(0, 0)]);

    expect(result.questions).toBe(2);
    expect(result.recall).toBe(0.5);
    expect(result.mrr).toBe(0.5);
  });

  it('returns zeros rather than NaN for an empty run', () => {
    expect(aggregate([])).toEqual({ questions: 0, recall: 0, mrr: 0 });
  });
});

describe('findUnindexedExpectations', () => {
  it('flags ground truth naming symbols that are not in the index', () => {
    const questions: EvalQuestion[] = [
      { id: 'q1', question: 'a', expect: ['Real.one', 'Typo.tow'] },
      { id: 'q2', question: 'b', expect: ['Real.one'] },
    ];

    const broken = findUnindexedExpectations(questions, new Set(['Real.one']));

    expect(broken).toEqual([{ id: 'q1', unknown: ['Typo.tow'] }]);
  });

  it('returns nothing when every expectation exists', () => {
    const questions: EvalQuestion[] = [{ id: 'q1', question: 'a', expect: ['Real.one'] }];

    expect(findUnindexedExpectations(questions, new Set(['Real.one']))).toEqual([]);
  });
});
