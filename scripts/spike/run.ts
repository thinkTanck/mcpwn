/**
 * The spike runner entry: run one cell, or the selected matrix, for real.
 *
 * `spike:cell` runs the first selected cell once; `spike:matrix` runs the whole
 * selection. Both read the sweep from the environment, mint each cell's own run
 * against the durable store (so a local `next start` on the same Supabase project
 * serves the endpoint), spawn the subject agent, read the trace, classify it
 * judge-free, and print a plain-language table. Nothing is hardcoded.
 *
 * Preconditions the human sets up (this file starts nothing on its own): a local
 * `next start` on the same Supabase project, `SPIKE_SITE_ORIGIN` pointed at it,
 * and the run config in the environment.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { selectCells } from './cells';
import { aggregate, formatAggregation } from './aggregate';
import { runMatrix } from './run-matrix';
import { createExecutor } from './executor';
import {
  spawnAgent,
  writeConfig,
  removeConfig,
  buildSpikeRuntime,
  verdictClassification,
} from './adapters';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function first(values: string[]): string {
  const value = values[0];
  if (value === undefined) throw new Error('no cell to run');
  return value;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'cell' && mode !== 'matrix') {
    throw new Error('usage: tsx scripts/spike/run.ts cell|matrix');
  }

  const userId = requireEnv('SPIKE_USER_ID');
  // The model the subject agent runs as, and the label recorded on the trace.
  // Read from env, never hardcoded; it must be a value `claude --model` accepts on
  // the installed Claude Code (for example claude-fable-5 on 2.1.234).
  const model = requireEnv('SPIKE_SUBJECT_MODEL');
  // Where each run's trace file and the matrix summary are written, so traces
  // survive the reaper. Read from env, never hardcoded.
  const exportDir = requireEnv('SPIKE_EXPORT_DIR');

  const selection = selectCells();
  const dimensions =
    mode === 'cell'
      ? {
          categories: [first(selection.categories)],
          framings: [first(selection.framings)],
          reps: 1,
        }
      : selection;

  const { mint, judge, exportTrace, repository } = await buildSpikeRuntime({
    userId,
    model,
    exportDir,
  });
  const runCell = createExecutor({
    spawnAgent,
    writeConfig,
    removeConfig,
    issueRun: mint,
    judge,
    exportTrace,
  });

  const results = await runMatrix({
    categories: dimensions.categories,
    framings: dimensions.framings,
    reps: dimensions.reps,
    // Unused on the per-cell path: each cell mints its own endpoint and token, so
    // the executor ignores the config runMatrix builds from these. The allowance
    // ceiling below is what runMatrix enforces before any cell is staged.
    endpoint: '',
    token: '',
    allowance: { repository, userId },
    runCell,
    // The frozen judge scores each cell, not classifyTrace: the verdict's
    // compromised flag becomes the performed-harmful-action count.
    classify: (result) => verdictClassification(result),
    // A single cell's judge failure must not abort the sweep. Surface it and carry
    // on; the cell is recorded errored and shows in the final table.
    onCellError: ({ cell, error }) =>
      console.error(
        `cell ${cell.category}/${cell.framing}/${cell.rep} errored: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      ),
  });

  const aggregation = aggregate(results);
  // The whole sweep at a glance next to the per-run files: the full results table
  // (every cell and its classification) plus the harmful and errored counts. Create
  // the export dir first, so the summary is not lost to an ENOENT on a fresh dir.
  await mkdir(exportDir, { recursive: true });
  await writeFile(
    join(exportDir, 'matrix-summary.json'),
    JSON.stringify({ results, rows: aggregation.rows, totals: aggregation.totals }, null, 2),
  );

  console.log(formatAggregation(aggregation));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
