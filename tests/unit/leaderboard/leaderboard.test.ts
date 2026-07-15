import { RunResultSchema, type Category, type RunResult } from '@/contract';
import { TraceBuilder, type TraceMeta } from '@/attacks/engine';
import { buildLeaderboard } from '@/leaderboard';

/**
 * Build a schema-valid, unlabeled RunResult for a (model, category) with a known
 * `verdict.compromised`. A minimal 1-step observable Trace comes from the engine's
 * TraceBuilder; the Verdict obeys the contract invariant that `stepId` is present
 * IFF `compromised`. Everything is parsed through RunResultSchema so the fixture
 * can never drift from the real contract.
 */
let seq = 0;
function makeRunResult(model: string, category: Category, compromised: boolean): RunResult {
  seq += 1;
  const runId = `run-${seq}`;
  const target = 'https://mcp.example.com';
  const meta: TraceMeta = { runId, target, model, category };
  const builder = new TraceBuilder(meta);
  const stepId = builder.attacker('probe the agent');
  const trace = builder.build();
  const verdict = compromised
    ? {
        runId,
        compromised: true,
        score: 1,
        severity: 'High',
        category,
        rationale: 'compromise detected',
        stepId,
      }
    : {
        runId,
        compromised: false,
        score: 0,
        severity: 'None',
        category,
        rationale: 'resisted the attack',
      };
  return RunResultSchema.parse({ runId, target, model, category, trace, verdict });
}

describe('buildLeaderboard — per-model × per-category robustness (deterministic)', () => {
  it('aggregates a ≥2 model × ≥2 category mix into cells, per-model, per-category and grand totals', () => {
    // alpha/ASI01: 2 of 3 resisted · alpha/ASI02: 0 of 1 · beta/ASI01: 2 of 2 · beta/ASI02: 1 of 2
    const results = [
      makeRunResult('alpha', 'ASI01', false),
      makeRunResult('alpha', 'ASI01', false),
      makeRunResult('alpha', 'ASI01', true),
      makeRunResult('alpha', 'ASI02', true),
      makeRunResult('beta', 'ASI01', false),
      makeRunResult('beta', 'ASI01', false),
      makeRunResult('beta', 'ASI02', false),
      makeRunResult('beta', 'ASI02', true),
    ];

    const lb = buildLeaderboard(results);

    // sorted + distinct axes
    expect(lb.models).toEqual(['alpha', 'beta']);
    expect(lb.categories).toEqual(['ASI01', 'ASI02']);

    // per-cell robustness = notCompromised / runs
    expect(lb.cells.alpha?.ASI01).toEqual({ runs: 3, notCompromised: 2, robustness: 2 / 3 });
    expect(lb.cells.alpha?.ASI02).toEqual({ runs: 1, notCompromised: 0, robustness: 0 });
    expect(lb.cells.beta?.ASI01).toEqual({ runs: 2, notCompromised: 2, robustness: 1 });
    expect(lb.cells.beta?.ASI02).toEqual({ runs: 2, notCompromised: 1, robustness: 0.5 });

    // per-model overall (across that model's categories)
    expect(lb.byModel.alpha).toEqual({ runs: 4, notCompromised: 2, robustness: 0.5 });
    expect(lb.byModel.beta).toEqual({ runs: 4, notCompromised: 3, robustness: 0.75 });

    // per-category overall (across all models)
    expect(lb.byCategory.ASI01).toEqual({ runs: 5, notCompromised: 4, robustness: 0.8 });
    expect(lb.byCategory.ASI02).toEqual({ runs: 3, notCompromised: 1, robustness: 1 / 3 });

    // grand overall
    expect(lb.overall).toEqual({ runs: 8, notCompromised: 5, robustness: 5 / 8 });
  });

  it('is deterministic and order-independent (sorted, distinct axes)', () => {
    const base = [
      makeRunResult('beta', 'ASI02', true),
      makeRunResult('alpha', 'ASI01', false),
      makeRunResult('beta', 'ASI01', false),
      makeRunResult('alpha', 'ASI01', true),
    ];
    const shuffled = [base[3]!, base[0]!, base[2]!, base[1]!];

    const a = buildLeaderboard(base);
    const b = buildLeaderboard(shuffled);

    expect(a.models).toEqual(['alpha', 'beta']);
    expect(a.categories).toEqual(['ASI01', 'ASI02']);
    // reordering the input never changes the aggregation
    expect(b).toEqual(a);
  });

  it('omits a MISSING cell — a model with runs in one category but not another', () => {
    const results = [
      makeRunResult('gamma', 'ASI04', false),
      makeRunResult('gamma', 'ASI04', true),
      makeRunResult('delta', 'ASI06', false),
    ];

    const lb = buildLeaderboard(results);

    expect(lb.models).toEqual(['delta', 'gamma']);
    expect(lb.categories).toEqual(['ASI04', 'ASI06']);

    // gamma only ran ASI04 → its ASI06 cell is ABSENT (not zero-filled)
    expect(lb.cells.gamma).toHaveProperty('ASI04');
    expect(lb.cells.gamma).not.toHaveProperty('ASI06');
    expect(lb.cells.gamma?.ASI06).toBeUndefined();

    // delta only ran ASI06 → its ASI04 cell is ABSENT
    expect(lb.cells.delta).toHaveProperty('ASI06');
    expect(lb.cells.delta).not.toHaveProperty('ASI04');
    expect(lb.cells.delta?.ASI04).toBeUndefined();
  });

  it('handles EMPTY input without crashing', () => {
    const lb = buildLeaderboard([]);

    expect(lb.models).toEqual([]);
    expect(lb.categories).toEqual([]);
    expect(lb.cells).toEqual({});
    expect(lb.byModel).toEqual({});
    expect(lb.byCategory).toEqual({});
    // runs === 0 guard: robustness is 0, never NaN
    expect(lb.overall).toEqual({ runs: 0, notCompromised: 0, robustness: 0 });
    expect(Number.isNaN(lb.overall.robustness)).toBe(false);
  });

  it('an all-compromised cell has robustness 0', () => {
    const results = [makeRunResult('rogue', 'ASI10', true), makeRunResult('rogue', 'ASI10', true)];

    const lb = buildLeaderboard(results);

    expect(lb.cells.rogue?.ASI10).toEqual({ runs: 2, notCompromised: 0, robustness: 0 });
    expect(lb.byModel.rogue?.robustness).toBe(0);
    expect(lb.byCategory.ASI10?.robustness).toBe(0);
    expect(lb.overall.robustness).toBe(0);
  });

  it('spans all 7 Core-7 categories (incl. ASI03 + ASI05) across models, keeping missing cells absent', () => {
    // alpha runs ASI01,ASI02,ASI03,ASI04,ASI05,ASI06 (never ASI10);
    // beta runs ASI03,ASI05,ASI10 (never ASI01) — union covers all 7 categories.
    const results = [
      makeRunResult('alpha', 'ASI01', false),
      makeRunResult('alpha', 'ASI02', true),
      makeRunResult('alpha', 'ASI03', false),
      makeRunResult('alpha', 'ASI03', true),
      makeRunResult('alpha', 'ASI04', false),
      makeRunResult('alpha', 'ASI05', false),
      makeRunResult('alpha', 'ASI06', false),
      makeRunResult('beta', 'ASI03', false),
      makeRunResult('beta', 'ASI05', true),
      makeRunResult('beta', 'ASI05', true),
      makeRunResult('beta', 'ASI10', true),
    ];

    const lb = buildLeaderboard(results);

    // all 7 category codes present on the axis, sorted (ASI10 sorts after ASI06)
    expect(lb.categories).toEqual(['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI10']);
    expect(lb.models).toEqual(['alpha', 'beta']);

    // controlled ASI03 cells: robustness = notCompromised / runs
    expect(lb.cells.alpha?.ASI03).toEqual({ runs: 2, notCompromised: 1, robustness: 0.5 });
    expect(lb.cells.beta?.ASI03).toEqual({ runs: 1, notCompromised: 1, robustness: 1 });
    // controlled ASI05 cells
    expect(lb.cells.alpha?.ASI05).toEqual({ runs: 1, notCompromised: 1, robustness: 1 });
    expect(lb.cells.beta?.ASI05).toEqual({ runs: 2, notCompromised: 0, robustness: 0 });

    // a model with NO runs in a category → that cell is ABSENT (not zero-filled)
    expect(lb.cells.beta).not.toHaveProperty('ASI01');
    expect(lb.cells.beta?.ASI01).toBeUndefined();
    expect(lb.cells.alpha).not.toHaveProperty('ASI10');
    expect(lb.cells.alpha?.ASI10).toBeUndefined();

    // per-category aggregates for the two new codes (across both models)
    expect(lb.byCategory.ASI03).toEqual({ runs: 3, notCompromised: 2, robustness: 2 / 3 });
    expect(lb.byCategory.ASI05).toEqual({ runs: 3, notCompromised: 1, robustness: 1 / 3 });

    // grand overall: 11 runs, 6 resisted
    expect(lb.overall).toEqual({ runs: 11, notCompromised: 6, robustness: 6 / 11 });
  });

  it('an all-not-compromised cell has robustness 1', () => {
    const results = [
      makeRunResult('sentinel', 'ASI04', false),
      makeRunResult('sentinel', 'ASI04', false),
    ];

    const lb = buildLeaderboard(results);

    expect(lb.cells.sentinel?.ASI04).toEqual({ runs: 2, notCompromised: 2, robustness: 1 });
    expect(lb.byModel.sentinel?.robustness).toBe(1);
    expect(lb.byCategory.ASI04?.robustness).toBe(1);
    expect(lb.overall.robustness).toBe(1);
  });
});
