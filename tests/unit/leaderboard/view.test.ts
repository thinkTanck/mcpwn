import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { buildLeaderboard } from '@/leaderboard';
import { CORE7_AXIS, CORE7_TITLES } from '@/leaderboard/axis';
import { toLeaderboardView } from '@/leaderboard/view';

/**
 * The PRESENTER between module 5 (the real aggregator) and the leaderboard
 * screen's view model. These tests pin the three things that make the wiring
 * honest:
 *
 *  1. Every displayed value is COMPUTED by the aggregator from run verdicts.
 *  2. A cell the data does not cover is NO DATA, never a zero. Zero robustness
 *     reads as "compromised in every run", which is a claim absent data cannot
 *     make, so the cell carries `state: 'none'` and `robustness: null`.
 *  3. Every cell is stamped with WHERE ITS NUMBER CAME FROM. A renderer can then
 *     tell a measured cell from a fixture cell without guessing, and a visitor
 *     can never mistake one for the other.
 */

let seq = 0;

/** A schema-valid, unlabeled RunResult with a known `verdict.compromised`. */
function run(model: string, category: Category, compromised: boolean): RunResult {
  seq += 1;
  const runId = `view-run-${seq}`;
  const target = 'https://mcp.example.com';
  const steps = [{ id: 's1', type: 'principal_instruction', content: 'probe' }];
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

const AXIS: readonly Category[] = ['ASI01', 'ASI02'];
const TITLES = { ASI01: 'Agent Goal Hijack' } as const;

describe('toLeaderboardView — module 5 aggregate to screen view model', () => {
  it('computes every cell from run verdicts, along the axis the caller asked for', () => {
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
      categories: AXIS,
      source: 'fixture',
    });

    expect(view.categories).toEqual([
      { id: 'ASI01', full: 'Agent Goal Hijack' },
      // no title supplied: the id stands in rather than an invented name
      { id: 'ASI02', full: 'ASI02' },
    ]);
    expect(view.rows.map((r) => r.model)).toEqual(['Model A', 'Model B']);
    expect(view.rows[0]?.cells).toEqual([
      { model: 'Model A', category: 'ASI01', state: 'fixture', robustness: 0.75, runs: 4 },
      { model: 'Model A', category: 'ASI02', state: 'fixture', robustness: 1, runs: 2 },
    ]);
    expect(view.rows[1]?.cells).toEqual([
      { model: 'Model B', category: 'ASI01', state: 'fixture', robustness: 0, runs: 2 },
      { model: 'Model B', category: 'ASI02', state: 'fixture', robustness: 0.5, runs: 2 },
    ]);
    expect(view.runs).toBe(10);
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
      categories: AXIS,
      source: 'fixture',
    });

    expect(view.rows[0]?.overall).toBeCloseTo(5 / 6, 10);
    expect(view.rows[0]?.overall).not.toBeCloseTo(0.875, 3);
    expect(view.rows[0]?.runs).toBe(6);
  });

  it('marks a cell the runs do not cover as NO DATA, never as a zero', () => {
    // Model A never ran ASI02, so the matrix has a hole in a column that exists.
    const results = [run('Model A', 'ASI01', false), run('Model B', 'ASI02', false)];

    const view = toLeaderboardView(buildLeaderboard(results), {
      titles: TITLES,
      categories: AXIS,
      source: 'measured',
    });

    const hole = view.rows.find((r) => r.model === 'Model A')?.cells[1];
    expect(hole).toEqual({
      model: 'Model A',
      category: 'ASI02',
      state: 'none',
      robustness: null,
      runs: 0,
    });
    // The distinction this exists for: a real 0.00 is a different cell state.
    const zero = toLeaderboardView(buildLeaderboard([run('Model C', 'ASI01', true)]), {
      titles: TITLES,
      categories: AXIS,
      source: 'measured',
    }).rows[0]?.cells[0];
    expect(zero).toEqual({
      model: 'Model C',
      category: 'ASI01',
      state: 'measured',
      robustness: 0,
      runs: 1,
    });
  });

  it('refuses an aggregate holding a category the requested axis does not render', () => {
    // Silently dropping the column would leave those runs inside OVERALL while
    // no cell accounts for them, which is a board that does not add up.
    const results = [run('Model A', 'ASI01', false), run('Model A', 'ASI06', false)];
    expect(() =>
      toLeaderboardView(buildLeaderboard(results), {
        titles: TITLES,
        categories: AXIS,
        source: 'measured',
      }),
    ).toThrowError(/ASI06/);
  });

  it('stamps every cell and row with the provenance the caller states', () => {
    const view = toLeaderboardView(buildLeaderboard([run('Model A', 'ASI01', false)]), {
      titles: TITLES,
      categories: AXIS,
      source: 'measured',
    });
    expect(view.source).toBe('measured');
    expect(view.rows[0]?.state).toBe('measured');
    expect(view.rows[0]?.cells[0]?.state).toBe('measured');
    // ...and the untouched column is NO DATA, which is not a provenance claim.
    expect(view.rows[0]?.cells[1]?.state).toBe('none');
  });

  it('renders an empty board for no runs instead of inventing rows', () => {
    const view = toLeaderboardView(buildLeaderboard([]), {
      titles: CORE7_TITLES,
      categories: CORE7_AXIS,
      source: 'measured',
    });
    expect(view.rows).toEqual([]);
    expect(view.runs).toBe(0);
    expect(view.source).toBe('measured');
    // The axis still stands, so an empty board can name what is not measured.
    expect(view.categories.map((c) => c.id)).toEqual([...CORE7_AXIS]);
  });
});
