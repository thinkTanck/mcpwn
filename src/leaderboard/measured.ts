import type { RunResult } from '@/contract';
import { buildLeaderboard } from './index';
import { CORE7_AXIS, CORE7_TITLES } from './axis';
import { toLeaderboardView, type Leaderboard } from './view';

/**
 * THE MEASURED BOARD — per-model robustness over the runs that were actually
 * executed and persisted (plan.md B4).
 *
 * Pure: the caller does the reading (the runs come from `RunRepository`,
 * owner-scoped), this does the arithmetic. That keeps the honest part testable
 * without a database and keeps auth out of the aggregation.
 *
 * WHAT IT DOES WITH AN ABSENCE IS THE WHOLE POINT. Nobody has produced a
 * multi-model campaign yet, so the case this ships in is `runs = []`, and the
 * answer to that is an EMPTY board: no rows, zero runs, `source: 'measured'`.
 * It is not padded with the fixture, and it is not extrapolated from the
 * detector's measured precision/recall — those figures describe the JUDGE (does
 * it call a compromise correctly, and file the right category), not any model's
 * resistance, and reusing them here would be inventing a measurement.
 *
 * The Core-7 axis is rendered whole even when only one column has runs, so the
 * board reports what has not been measured as plainly as what has.
 */
export function measuredLeaderboard(runs: RunResult[]): Leaderboard {
  return toLeaderboardView(buildLeaderboard(runs), {
    titles: CORE7_TITLES,
    categories: CORE7_AXIS,
    source: 'measured',
  });
}
