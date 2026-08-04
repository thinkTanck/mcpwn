import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { buildLeaderboard } from '@/leaderboard';
import { toLeaderboardView } from '@/leaderboard/view';

/**
 * The PRESENTER between module 5 (the real aggregator) and the leaderboard
 * screen's view model. These tests pin the two things that make the wiring
 * honest: every displayed value is COMPUTED by the aggregator from run
 * verdicts, and a matrix with a hole FAILS LOUDLY instead of zero-filling a
 * cell (a zero would read as "this model was compromised in every run", which
 * is a claim the absence of data cannot support).
 */

let seq = 0;

/** A schema-valid, unlabeled RunResult with a known `verdict.compromised`. */
function run(model: string, category: Category, compromised: boolean): RunResult {
  seq += 1;
  const runId = `view-run-${seq}`;
  const target = 'https://mcp.example.com';
  const steps = [{ id: 's1', type: 'attacker', content: 'probe' }];
  const verdict = compromised
    ? {
        runId,
        compromised: true,
        score: 1,
        severity: 'High',
        category,
        rationale: 'compromised',
        stepId: 's1',
      }
    : { runId, compromised: false, score: 0, severity: 'None', category, rationale: 'resisted' };
  return RunResultSchema.parse({
    runId,
    target,
    model,
    category,
    trace: { runId, target, model, category, steps },
    verdict,
  });
}

const TITLES = { ASI01: 'Agent Goal Hijack' } as const;

describe('toLeaderboardView — module 5 aggregate to screen view model', () => {
  it('computes every cell from run verdicts, in the sorted axis order of the aggregator', () => {
    // Model A: ASI01 3 of 4 resisted (.75), ASI02 2 of 2 resisted (1.00).
    // Model B: ASI01 0 of 2 (.00),          ASI02 1 of 2 (.50).
    const results = [
      run('Model A', 'ASI01', true),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI02', false),
      run('Model A', 'ASI02', false),
      run('Model B', 'ASI01', true),
      run('Model B', 'ASI01', true),
      run('Model B', 'ASI02', true),
      run('Model B', 'ASI02', false),
    ];

    const view = toLeaderboardView(buildLeaderboard(results), {
      titles: TITLES,
      source: 'fixture',
    });

    expect(view.categories).toEqual([
      { id: 'ASI01', full: 'Agent Goal Hijack' },
      // no title supplied: the id stands in rather than an invented name
      { id: 'ASI02', full: 'ASI02' },
    ]);
    expect(view.rows.map((r) => r.model)).toEqual(['Model A', 'Model B']);
    expect(view.rows[0]?.cells).toEqual([
      { model: 'Model A', category: 'ASI01', robustness: 0.75 },
      { model: 'Model A', category: 'ASI02', robustness: 1 },
    ]);
    expect(view.rows[1]?.cells).toEqual([
      { model: 'Model B', category: 'ASI01', robustness: 0 },
      { model: 'Model B', category: 'ASI02', robustness: 0.5 },
    ]);
  });

  it('takes OVERALL from the run-weighted aggregator total, not a mean of cells', () => {
    // Model A resisted 5 of 6 runs (.8333) while the MEAN of its two cells is
    // .875 — the two differ whenever the cells hold different run counts, and
    // the run-weighted figure is the one the aggregator computes.
    const results = [
      run('Model A', 'ASI01', true),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI01', false),
      run('Model A', 'ASI02', false),
      run('Model A', 'ASI02', false),
    ];

    const view = toLeaderboardView(buildLeaderboard(results), {
      titles: TITLES,
      source: 'fixture',
    });

    expect(view.rows[0]?.overall).toBeCloseTo(5 / 6, 10);
    expect(view.rows[0]?.overall).not.toBeCloseTo(0.875, 3);
  });

  it('throws naming the gap rather than zero-filling a cell the data does not cover', () => {
    // Model A never ran ASI02, so the matrix has a hole in a column that exists.
    const results = [run('Model A', 'ASI01', false), run('Model B', 'ASI02', false)];

    expect(() =>
      toLeaderboardView(buildLeaderboard(results), { titles: TITLES, source: 'fixture' }),
    ).toThrowError(/Model A/);
    expect(() =>
      toLeaderboardView(buildLeaderboard(results), { titles: TITLES, source: 'fixture' }),
    ).toThrowError(/ASI02/);
  });

  it('carries the provenance the caller states, never assuming it', () => {
    const view = toLeaderboardView(buildLeaderboard([run('Model A', 'ASI01', false)]), {
      titles: TITLES,
      source: 'fixture',
    });
    expect(view.source).toBe('fixture');
  });

  it('renders an empty board for no runs instead of inventing rows', () => {
    const view = toLeaderboardView(buildLeaderboard([]), { titles: TITLES, source: 'fixture' });
    expect(view).toEqual({ categories: [], rows: [], source: 'fixture' });
  });
});
