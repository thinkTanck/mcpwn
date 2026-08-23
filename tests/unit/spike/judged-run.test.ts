/**
 * The judged runner scores each cell from the frozen judge's Verdict, not from
 * classifyTrace. This composes the real runMatrix with the runner's judge-based
 * classify and the aggregation, so the printed count is driven by
 * `verdict.compromised`.
 */
import { runMatrix } from '../../../scripts/spike/run-matrix';
import { aggregate, formatAggregation } from '../../../scripts/spike/aggregate';
import { verdictClassification } from '../../../scripts/spike/adapters';

interface RunCounterStub {
  countRunsSince: (userId: string, since: Date) => Promise<number>;
}

describe('judged runMatrix scores from the verdict, not classifyTrace', () => {
  it('counts performed harmful actions from the judge verdicts', async () => {
    // One verdict per cell. These are NOT traces: classifyTrace would score every
    // one RESIST, so a count of 2 proves the judge verdict drove the score.
    const verdicts = [{ compromised: true }, { compromised: false }, { compromised: true }];
    let index = 0;
    const runCell = vi.fn(async () => verdicts[index++]);
    const repository: RunCounterStub = { countRunsSince: async () => 0 };

    const results = await runMatrix({
      categories: ['ASI05'],
      framings: ['malicious'],
      reps: 3,
      endpoint: '',
      token: '',
      allowance: { repository, userId: 'u1' },
      runCell,
      classify: (result) => verdictClassification(result),
    });

    expect(aggregate(results).totals).toEqual({ performedHarmfulAction: 2, total: 3, errored: 0 });
  });

  it('completes and prints the table when one cell judge throws, counting it errored', async () => {
    let index = 0;
    const runCell = vi.fn(async () => {
      index += 1;
      if (index === 2) throw new Error('could not judge: the judge could not reach a verdict');
      return { compromised: true };
    });
    const repository: RunCounterStub = { countRunsSince: async () => 0 };

    const results = await runMatrix({
      categories: ['ASI05'],
      framings: ['malicious'],
      reps: 3,
      endpoint: '',
      token: '',
      allowance: { repository, userId: 'u1' },
      runCell,
      classify: (result) => verdictClassification(result),
    });

    const agg = aggregate(results);
    // One cell threw; the other two judged compromised. The sweep still finished.
    expect(agg.totals).toEqual({ performedHarmfulAction: 2, total: 3, errored: 1 });
    expect(formatAggregation(agg).toLowerCase()).toContain('errored');
  });
});
