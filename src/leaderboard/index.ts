/**
 * Module 5 — ROBUSTNESS LEADERBOARD.
 *
 * Aggregates unlabeled live `RunResult`s into a per-model × per-category ROBUSTNESS
 * matrix, where robustness = the fraction of runs the model did NOT get compromised
 * on (`verdict.compromised === false`). A robust model resists attacks, so higher is
 * better. Pure and deterministic: the output is a function of the input alone —
 * counts, sorted/distinct axes, and guarded divides (no ordering or clock effects).
 * MISSING cells (a model with no runs in a category) are ABSENT, never zero-filled.
 */
import type { Category, RunResult } from '@/contract';

/** One aggregated cell: how many runs, how many resisted, and their [0,1] ratio. */
export interface CellRobustness {
  runs: number;
  notCompromised: number;
  /** notCompromised / runs, in [0, 1]; 0 when runs === 0 (guarded divide). */
  robustness: number;
}

/** The full leaderboard: axes, the cell matrix, and the marginal + grand totals. */
export interface Leaderboard {
  /** Distinct models with ≥1 run, sorted. */
  models: string[];
  /** Distinct categories present, sorted. */
  categories: Category[];
  /** model → category → cell. Only categories that model actually ran are present. */
  cells: Record<string, Partial<Record<Category, CellRobustness>>>;
  /** Per-model overall (across that model's categories). */
  byModel: Record<string, CellRobustness>;
  /** Per-category overall (across all models). */
  byCategory: Partial<Record<Category, CellRobustness>>;
  /** Grand total across every run. */
  overall: CellRobustness;
}

/** Mutable running counts; frozen into a `CellRobustness` at the end. */
interface Tally {
  runs: number;
  notCompromised: number;
}

function emptyTally(): Tally {
  return { runs: 0, notCompromised: 0 };
}

/** Get the tally for `key`, creating (and inserting) a zeroed one on first sight. */
function getOrInit<K>(map: Map<K, Tally>, key: K): Tally {
  const existing = map.get(key);
  if (existing) return existing;
  const created = emptyTally();
  map.set(key, created);
  return created;
}

function bump(tally: Tally, notCompromised: boolean): void {
  tally.runs += 1;
  if (notCompromised) tally.notCompromised += 1;
}

/** Freeze a tally into a cell, guarding the divide so 0 runs → robustness 0 (not NaN). */
function toCell(tally: Tally): CellRobustness {
  const robustness = tally.runs === 0 ? 0 : tally.notCompromised / tally.runs;
  return { runs: tally.runs, notCompromised: tally.notCompromised, robustness };
}

/**
 * Aggregate live runs into the robustness leaderboard. `notCompromised` counts
 * results whose `verdict.compromised === false`. Empty input yields empty axes and
 * a zeroed overall — never a crash.
 */
export function buildLeaderboard(results: RunResult[]): Leaderboard {
  const cellTallies = new Map<string, Map<Category, Tally>>();
  const modelTallies = new Map<string, Tally>();
  const categoryTallies = new Map<Category, Tally>();
  const overallTally = emptyTally();

  for (const result of results) {
    const { model, category } = result;
    const notCompromised = result.verdict.compromised === false;

    let row = cellTallies.get(model);
    if (!row) {
      row = new Map<Category, Tally>();
      cellTallies.set(model, row);
    }
    bump(getOrInit(row, category), notCompromised);
    bump(getOrInit(modelTallies, model), notCompromised);
    bump(getOrInit(categoryTallies, category), notCompromised);
    bump(overallTally, notCompromised);
  }

  // Build every output from map ENTRIES (key + tally together) so there is no
  // re-`get` and thus no dead undefined-fallback branch; sort by key for a stable,
  // deterministic shape. `localeCompare` keeps sorting branch-free in this module.
  const byKey = (a: readonly [string, unknown], b: readonly [string, unknown]): number =>
    a[0].localeCompare(b[0]);

  const cells: Record<string, Partial<Record<Category, CellRobustness>>> = {};
  for (const [model, row] of [...cellTallies.entries()].sort(byKey)) {
    const cellsForModel: Partial<Record<Category, CellRobustness>> = {};
    for (const [category, tally] of [...row.entries()].sort(byKey)) {
      cellsForModel[category] = toCell(tally);
    }
    cells[model] = cellsForModel;
  }

  const byModel: Record<string, CellRobustness> = {};
  for (const [model, tally] of [...modelTallies.entries()].sort(byKey)) {
    byModel[model] = toCell(tally);
  }

  const byCategory: Partial<Record<Category, CellRobustness>> = {};
  for (const [category, tally] of [...categoryTallies.entries()].sort(byKey)) {
    byCategory[category] = toCell(tally);
  }

  return {
    models: [...cellTallies.keys()].sort(),
    categories: [...categoryTallies.keys()].sort(),
    cells,
    byModel,
    byCategory,
    overall: toCell(overallTally),
  };
}
