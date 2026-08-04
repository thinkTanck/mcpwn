/**
 * PRESENTER — module 5's robustness aggregate rendered as the leaderboard
 * screen's view model.
 *
 * The aggregator (`buildLeaderboard`) is keyed by model and category and omits
 * cells it has no runs for; the screen is a positional table that needs one
 * cell per column, plus display titles for the category codes. This module is
 * the only place those two shapes meet, so the aggregator stays pure and the
 * screen stays dumb.
 *
 * TWO RULES it exists to enforce:
 *  1. Every displayed value is COMPUTED here from the aggregate, never typed
 *     alongside it.
 *  2. A missing cell is NOT a zero. Zero robustness means "compromised in every
 *     run", which is a claim absent data cannot support, so a hole in the matrix
 *     throws and names itself instead of rendering a slander.
 *
 * The view type is imported from the DataSource port (`@/data/source`), which is
 * where the screens' contract lives. It is a TYPE-only import, so nothing in the
 * data layer is pulled into this module at runtime.
 */
import type { Category } from '@/contract';
import type { Leaderboard as LeaderboardView, LeaderboardRow } from '@/data/source';
import type { Leaderboard as RobustnessBoard } from './index';

/** Display title per category code. A code with no title renders as the code. */
export type CategoryTitles = Readonly<Partial<Record<Category, string>>>;

export interface LeaderboardViewOptions {
  titles: CategoryTitles;
  /**
   * Provenance, stated by the CALLER. The presenter never assumes it: whether a
   * board came from placeholder runs or measured ones is knowledge the caller
   * has and this function does not.
   */
  source: LeaderboardView['source'];
}

export function toLeaderboardView(
  board: RobustnessBoard,
  options: LeaderboardViewOptions,
): LeaderboardView {
  const categories = board.categories.map((id) => ({ id, full: options.titles[id] ?? id }));

  // Built from byModel ENTRIES so the model key and its total travel together
  // (no re-lookup, no dead undefined branch) and the aggregator's sorted order
  // is preserved.
  const rows: LeaderboardRow[] = Object.entries(board.byModel).map(([model, total]) => ({
    model,
    cells: board.categories.map((category) => {
      const cell = board.cells[model]?.[category];
      if (!cell) {
        throw new Error(
          `leaderboard has no runs for ${model} in ${category}: a missing cell is not a zero`,
        );
      }
      return { model, category, robustness: cell.robustness };
    }),
    overall: total.robustness,
  }));

  return { categories, rows, source: options.source };
}
