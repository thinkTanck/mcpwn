import type { Category, RunResult, Step, Verdict } from '@/contract';
import { buildLeaderboard } from '@/leaderboard';
import { CORE7_AXIS, CORE7_TITLES } from '@/leaderboard/axis';
import { toLeaderboardView, type Leaderboard } from '@/leaderboard/view';

/**
 * Per-model x per-category robustness (the fraction of runs the model left NOT
 * compromised), for the `/leaderboard` screen.
 *
 * PROVENANCE — this is a FIXTURE and says so, at three levels the screen keeps
 * visible: the board's own SOURCE readout, the section it is framed in, and
 * every single cell (`state: 'fixture'`). No per-model robustness has been
 * measured: that is plan.md item B4, and it needs real live runs against more
 * than one target model. "Model A/B/C" are placeholders, not products, and the
 * run counts below describe a campaign that was never executed.
 *
 * IT IS NOT THE SCREEN'S ANSWER TO "how robust is my model". The screen's
 * measured board is, and it is empty until real runs exist. This board is kept
 * only to demonstrate the aggregation and the tri-state colour language end to
 * end, and it is rendered subordinate to the measured one for exactly that
 * reason.
 *
 * WHAT IS REAL is the aggregation. The declared campaign is expanded into
 * contract-valid `RunResult`s and pushed through module 5's `buildLeaderboard`,
 * so every ratio it displays is computed from run verdicts by the same code a
 * measured campaign would use. Nothing here is a pre-baked ratio, and the run
 * counts are deliberately NOT surfaced in the UI, because a sample size is a
 * claim about evidence and this input has none to make. A measured cell DOES
 * surface its run count, which is one more way the two never look alike.
 */

const CATEGORY_ORDER: readonly Category[] = CORE7_AXIS;

/** One declared cell of the placeholder campaign: how many runs, how many resisted. */
export interface LeaderboardFixtureCell {
  model: string;
  category: Category;
  runs: number;
  resisted: number;
}

/** Runs per (model, category) cell in the placeholder campaign. */
const RUNS_PER_CELL = 25;

/**
 * How many of a cell's runs the model RESISTED. Declared as counts rather than
 * ratios, because a count is what an aggregator consumes and a ratio is what it
 * produces; declaring the ratio is what let the real module ship dark.
 */
const RESISTED_BY_MODEL: readonly { model: string; resisted: Record<Category, number> }[] = [
  {
    model: 'Model A',
    resisted: { ASI01: 23, ASI02: 20, ASI03: 19, ASI04: 18, ASI05: 14, ASI06: 9, ASI10: 21 },
  },
  {
    model: 'Model B',
    resisted: { ASI01: 22, ASI02: 17, ASI03: 16, ASI04: 14, ASI05: 11, ASI06: 13, ASI10: 19 },
  },
  {
    model: 'Model C',
    resisted: { ASI01: 18, ASI02: 12, ASI03: 13, ASI04: 10, ASI05: 8, ASI06: 7, ASI10: 16 },
  },
];

/** The declared campaign, flattened to one entry per (model, category) cell. */
export const LEADERBOARD_FIXTURE_CAMPAIGN: readonly LeaderboardFixtureCell[] =
  RESISTED_BY_MODEL.flatMap(({ model, resisted }) =>
    CATEGORY_ORDER.map((category) => ({
      model,
      category,
      runs: RUNS_PER_CELL,
      resisted: resisted[category],
    })),
  );

/**
 * The observable steps of a placeholder run. Shared (and identical) across every
 * fixture run on purpose: no trace was recorded for these, and inventing 525
 * distinct ones would dress a placeholder up as evidence. A compromised fixture
 * verdict anchors to the TOOL CALL, because compromise is an act by the agent
 * and never a condition of its input (ADR-0009).
 */
const FIXTURE_STEPS: readonly Step[] = [
  {
    id: 's1',
    type: 'principal_instruction',
    content: 'Placeholder fixture run. No principal instruction was recorded.',
  },
  { id: 's2', type: 'tool_call', tool: 'placeholder_tool', args: {} },
];
const OFFENDING_STEP_ID = 's2';

const FIXTURE_TARGET = 'https://fixture.invalid/mcp';

function fixtureVerdict(runId: string, category: Category, compromised: boolean): Verdict {
  return compromised
    ? {
        runId,
        compromised: true,
        score: 1,
        severity: 'High',
        category,
        rationale: 'Placeholder fixture verdict. No judge produced this.',
        stepId: OFFENDING_STEP_ID,
      }
    : {
        runId,
        compromised: false,
        score: 0,
        severity: 'None',
        category,
        rationale: 'Placeholder fixture verdict. No judge produced this.',
      };
}

const slug = (model: string) => model.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Expand the declared campaign into unlabeled `RunResult`s -- the INPUT the real
 * aggregator consumes. Contract-valid (a `RunResult` is strict and carries no
 * `groundTruth`), and the run id encodes model, category and index only, never
 * the verdict.
 */
export function leaderboardFixtureRuns(): RunResult[] {
  const runs: RunResult[] = [];
  for (const cell of LEADERBOARD_FIXTURE_CAMPAIGN) {
    for (let i = 0; i < cell.runs; i += 1) {
      const runId = `fixture-${slug(cell.model)}-${cell.category.toLowerCase()}-${i + 1}`;
      const compromised = i >= cell.resisted;
      runs.push({
        runId,
        target: FIXTURE_TARGET,
        model: cell.model,
        category: cell.category,
        trace: {
          runId,
          target: FIXTURE_TARGET,
          model: cell.model,
          category: cell.category,
          steps: FIXTURE_STEPS as Step[],
        },
        verdict: fixtureVerdict(runId, cell.category, compromised),
      });
    }
  }
  return runs;
}

/**
 * The demonstration board: real module 5 aggregation over placeholder runs,
 * labelled `fixture` end to end (board, section and every cell).
 */
export const leaderboardFixture: Leaderboard = toLeaderboardView(
  buildLeaderboard(leaderboardFixtureRuns()),
  { titles: CORE7_TITLES, categories: CORE7_AXIS, source: 'fixture' },
);
