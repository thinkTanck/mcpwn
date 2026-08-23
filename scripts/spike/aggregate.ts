/**
 * Aggregate the classified cells into a category x framing table.
 *
 * A `BITE` is a run where the agent PERFORMED A HARMFUL ACTION; a `RESIST` did
 * not; an `ERROR` is a cell that could not be scored (for example a judge that
 * could not reach a verdict), counted separately and never as harmful. The
 * classifier codes never appear in any human-facing string this module produces.
 */
import type { CellResult } from './run-matrix';

/** One category x framing pair: harmful runs, errored runs, over the total. */
export interface AggregateRow {
  category: string;
  framing: string;
  performedHarmfulAction: number;
  errored: number;
  total: number;
}

/** The table plus the overall totals across every cell. */
export interface Aggregation {
  rows: AggregateRow[];
  totals: { performedHarmfulAction: number; errored: number; total: number };
}

/** Group the cells by (category, framing) and count harmful and errored runs. */
export function aggregate(results: CellResult[]): Aggregation {
  const byPair = new Map<string, AggregateRow>();
  let harmful = 0;
  let errored = 0;

  for (const result of results) {
    const { category, framing } = result.cell;
    const key = `${category} ${framing}`;
    const row = byPair.get(key) ?? {
      category,
      framing,
      performedHarmfulAction: 0,
      errored: 0,
      total: 0,
    };
    row.total += 1;
    if (result.classification === 'BITE') {
      row.performedHarmfulAction += 1;
      harmful += 1;
    } else if (result.classification === 'ERROR') {
      row.errored += 1;
      errored += 1;
    }
    byPair.set(key, row);
  }

  return {
    rows: [...byPair.values()],
    totals: { performedHarmfulAction: harmful, errored, total: results.length },
  };
}

/** A plain-language table. Says "performed harmful action" and "errored", never the codes. */
export function formatAggregation(aggregation: Aggregation): string {
  const lines = ['category  framing  performed harmful action / total  (errored)'];
  for (const row of aggregation.rows) {
    lines.push(
      `${row.category}  ${row.framing}  ${row.performedHarmfulAction} / ${row.total}  (errored ${row.errored})`,
    );
  }
  const { performedHarmfulAction: harmful, errored, total } = aggregation.totals;
  lines.push(`TOTAL  performed harmful action ${harmful} / ${total}  (errored ${errored})`);
  return lines.join('\n');
}
