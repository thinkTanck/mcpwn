/**
 * `npm run eval:measure` — produce the MEASURED detector precision/recall.
 *
 * Runs the eval harness over every labeled realization with the real,
 * operator-provided judge, prints the aggregate and per-category numbers, and
 * writes the full report to a gitignored artifact.
 *
 * This is the only sanctioned way to obtain a P/R figure for the product. The
 * unit suite scores the harness against MOCK and ORACLE detectors, which proves
 * the harness runs and that the benign controls are genuine negatives; it does
 * not measure anything. Nothing measured here may be surfaced without its
 * provenance — the model, the fixture count, and the date all ride in the report
 * and belong beside any number that reaches a screen.
 *
 * Usage:
 *   npm run eval:measure
 *
 * Reads `JUDGE_MODEL`, `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_TEMPERATURE`
 * from the environment (`.env.local` is loaded automatically). With no judge
 * credential it exits non-zero with an explanation rather than inventing a
 * number. The key is never printed and never written to the artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { getAttack, listAttackCodes } from '@/attacks';
import { getJudgeConfig } from '@/config/env';
import { resolveLiveDetector } from '@/detector/resolve';
import { evaluateAll, type EvalReport, type Metrics } from '@/eval';
import type { Category, Trace, Verdict } from '@/contract';

/** Where reports land. Gitignored: a measurement is evidence, not source. */
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'eval');

/** One scored realization, kept for triage of whatever the metrics turn out to be. */
interface RecordRow {
  category: Category;
  variantId: string;
  actual: boolean;
  predicted: boolean;
  stepId?: string;
  severity: string;
  score: number;
  rationale: string;
}

/**
 * The realization order `evaluate()` walks: registered categories sorted, then
 * each attack's declared variants. It awaits one at a time, so the nth verdict
 * this script observes is the nth entry here. This coupling is what lets the
 * per-variant triage rows be paired with the held-out labels without the
 * detector ever seeing one.
 */
function enumerateRealizations(): Array<{
  category: Category;
  variantId: string;
  actual: boolean;
}> {
  return listAttackCodes().flatMap((category) =>
    getAttack(category).variants.map((variant) => ({
      category,
      variantId: variant.id,
      actual: getAttack(category).build(variant.id).groundTruth.compromised,
    })),
  );
}

function pct(value: number): string {
  return value.toFixed(4);
}

function printMetrics(label: string, m: Metrics): void {
  const cells = [
    label.padEnd(9),
    `P ${pct(m.precision)}`,
    `R ${pct(m.recall)}`,
    `n ${String(m.total).padStart(3)}`,
    `tp ${m.tp}  fp ${m.fp}  fn ${m.fn}  tn ${m.tn}`,
  ];
  console.log('  ' + cells.join('   '));
}

async function main(): Promise<number> {
  loadEnvConfig(process.cwd());

  const detect = resolveLiveDetector();
  if (!detect) {
    console.error(
      'No judge is configured, so there is nothing to measure.\n' +
        'Set JUDGE_MODEL, JUDGE_BASE_URL and JUDGE_API_KEY in .env.local and run again.\n' +
        'Refusing to emit a number that was not measured.',
    );
    return 1;
  }

  // Read back the resolved judge for provenance. The key is NOT destructured
  // out of this object anywhere below, and never reaches stdout or the file.
  const { model, temperature } = getJudgeConfig();
  const realizations = enumerateRealizations();

  console.log(
    `Judging ${realizations.length} labeled realizations with ${model} (t=${temperature}).`,
  );
  console.log('This makes one live judge call per realization.\n');

  const verdicts: Array<{ trace: Trace; verdict: Verdict }> = [];
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const report: EvalReport = await evaluateAll(async (trace, taskGoal) => {
    const verdict = await detect(trace, taskGoal);
    verdicts.push({ trace, verdict });
    process.stdout.write(
      `  [${String(verdicts.length).padStart(2)}/${realizations.length}] ` +
        `${verdict.compromised ? 'compromised' : 'clean      '} ` +
        `${verdict.stepId ?? '-'}\n`,
    );
    return verdict;
  });

  const elapsedMs = Math.round(performance.now() - t0);

  const rows: RecordRow[] = verdicts.map(({ verdict }, i) => {
    const realization = realizations[i]!;
    return {
      category: realization.category,
      variantId: realization.variantId,
      actual: realization.actual,
      predicted: verdict.compromised,
      ...(verdict.stepId !== undefined ? { stepId: verdict.stepId } : {}),
      severity: verdict.severity,
      score: verdict.score,
      rationale: verdict.rationale,
    };
  });

  console.log('\nMEASURED detector accuracy (compromised = positive class)\n');
  printMetrics('OVERALL', report.overall);
  console.log('');
  for (const category of listAttackCodes()) {
    const metrics = report.byCategory[category];
    if (metrics) printMetrics(category, metrics);
  }

  const misses = rows.filter((r) => r.actual !== r.predicted);
  if (misses.length > 0) {
    console.log(`\n${misses.length} disagreement(s) with the held-out ground truth:\n`);
    for (const row of misses) {
      const kind = row.actual ? 'FALSE NEGATIVE' : 'FALSE POSITIVE';
      console.log(`  ${kind}  ${row.category}  ${row.variantId}`);
      console.log(`    ${row.rationale}`);
    }
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = join(ARTIFACT_DIR, `eval-${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        provenance: {
          measuredAt: startedAt,
          judgeModel: model,
          judgeTemperature: temperature,
          fixtures: report.overall.total,
          elapsedMs,
        },
        report,
        records: rows,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nFull report written to ${file}`);
  console.log(
    `Provenance for any surfaced figure: measured · ${report.overall.total} labeled fixtures · ` +
      `${startedAt.slice(0, 10)}`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('eval:measure failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
