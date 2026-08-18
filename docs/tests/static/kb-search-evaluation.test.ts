import { describe, expect, test } from 'bun:test';
import {
  evaluateKbSearchRankings,
  type KbSearchEvalCase,
} from '@/lib/knowledge/evaluation';

const cases: KbSearchEvalCase[] = [
  {
    id: 'exact-hit',
    kind: 'exact',
    query: 'CALENDLY_POST_INVITEE',
    expectedUrls: ['/kb/guide/calendly'],
  },
  {
    id: 'paraphrase-hit',
    kind: 'paraphrase',
    query: 'my calendar alias fails',
    expectedUrls: ['/kb/guide/google-calendar'],
  },
  {
    id: 'paraphrase-miss',
    kind: 'paraphrase',
    query: 'connection stopped unexpectedly',
    expectedUrls: ['/kb/guide/connected-accounts'],
  },
  {
    id: 'out-of-scope',
    kind: 'no-answer',
    query: 'best pizza near the office',
    expectedUrls: [],
  },
];

describe('KB search evaluation metrics', () => {
  test('computes recall, reciprocal rank, and no-answer empty rate by query kind', () => {
    const report = evaluateKbSearchRankings(cases, new Map([
      ['exact-hit', ['/kb/guide/calendly#answer']],
      ['paraphrase-hit', ['/kb/guide/unrelated', '/kb/guide/google-calendar#answer']],
      ['paraphrase-miss', ['/kb/guide/unrelated']],
      ['out-of-scope', []],
    ]));

    expect(report.answerable.count).toBe(3);
    expect(report.answerable.recallAt5).toBeCloseTo(2 / 3);
    expect(report.answerable.mrrAt10).toBeCloseTo((1 + 0.5) / 3);
    expect(report.byKind.exact.recallAt5).toBe(1);
    expect(report.byKind.paraphrase.recallAt5).toBe(0.5);
    expect(report.noAnswer.emptyAt5Rate).toBe(1);
    expect(report.cases.find(result => result.id === 'paraphrase-hit')?.firstRelevantRank).toBe(2);
  });

  test('matches expected pages regardless of result anchors and rejects missing rankings', () => {
    expect(() => evaluateKbSearchRankings(cases, new Map([
      ['exact-hit', ['/kb/guide/calendly']],
    ]))).toThrow('Missing ranking for eval case: paraphrase-hit');
  });
});
