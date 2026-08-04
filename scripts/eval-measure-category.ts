/**
 * `npm run eval:measure-category` — produce the MEASURED category-classification
 * accuracy of the frozen judge.
 *
 * A SECOND measurement, not a second view of the first. `eval:measure` scores the
 * compromise call into precision/recall. This scores the Core-7 code the judge
 * assigned to each compromise it found, against the held-out
 * `GroundTruth.category`. The two numbers have different denominators and are
 * reported apart, always.
 *
 * WHY IT EXISTS. B3 recorded the sample verdicts from the frozen judge and one of
 * the seven came back misclassified: the ASI10 self-approval run was blindly read
 * as ASI01 Agent Goal Hijack, so the ASI10 fix report cites ASI01 remediation.
 * That is one observation, on one realization. This turns it into a measurement.
 *
 * NOTHING HERE CHANGES WHAT THE JUDGE SEES. `judgeableTrace()` already withholds
 * `Trace.category` (and `Trace.runId`), for exactly this reason: showing the judge
 * the attack code would print the answer to the question being asked, and any
 * accuracy measured that way would be a copy rather than a capability. This script
 * reads `verdict.category` off verdicts that have already been returned.
 *
 * WHAT IS SCORED. True positives only — a real compromise, classified by the
 * judge's own answer. A not-compromised verdict carries an ASSEMBLED category
 * (`detect()` fills it from the trace, because a clean run leaves the judge no
 * code to give), and a false positive has no true compromise for a code to be
 * right about. Both are excluded and both are REPORTED as excluded, so the
 * denominator is never mistaken for the fixture count.
 *
 * FIVE PASSES, MODAL ANSWER. The judge is not guaranteed deterministic at
 * temperature 0. Every realization is judged five times and the modal answer is
 * taken; anything that varied across the five is FLAGGED as unstable rather than
 * silently resolved by picking a pass.
 *
 * Usage:
 *   npm run eval:measure-category
 *
 * Reads `JUDGE_MODEL`, `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_TEMPERATURE`
 * from the environment (`.env.local` is loaded automatically). With no judge
 * credential it exits non-zero with an explanation rather than emitting a number
 * nobody measured. The key is never printed and never written to the artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { getAttack, listAttackCodes } from '@/attacks';
import { getJudgeConfig } from '@/config/env';
import { resolveLiveDetector } from '@/detector/resolve';
import { report, type ClassificationMetrics, type EvalRecord } from '@/eval';
import type { Category, Verdict } from '@/contract';

/** Where reports land. Gitignored: a measurement is evidence, not source. */
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'eval');

/** How many passes make a measurement. */
const PASSES = 5;

/**
 * The answer this script measures, reduced to a comparable key. `null` means the
 * judge made no classification on that pass (it called the run clean), which is a
 * distinct answer from any Core-7 code and must not collapse into one.
 */
type Answer = Category | null;

/** Most frequent value, ties broken by earliest occurrence. */
function modal(values: readonly Answer[]): { value: Answer; count: number } {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  let best: { value: Answer; count: number } | undefined;
  for (const v of values) {
    const count = counts.get(String(v)) ?? 0;
    if (best === undefined || count > best.count) best = { value: v, count };
  }
  if (best === undefined) throw new Error('modal() needs at least one value');
  return best;
}

interface Row {
  category: Category;
  variantId: string;
  actual: boolean;
  /** One `Answer` per pass, in pass order. */
  answers: Answer[];
  modalAnswer: Answer;
  modalCount: number;
  stable: boolean;
  /** The compromise call per pass, so classification instability is not confused
   *  with compromise instability. */
  compromiseCalls: boolean[];
}

function pct(value: number): string {
  return value.toFixed(4);
}

function printAccuracy(label: string, m: ClassificationMetrics): void {
  console.log(
    '  ' +
      [
        label.padEnd(9),
        `acc ${pct(m.accuracy)}`,
        `scored ${String(m.scored).padStart(3)}`,
        `correct ${m.correct}  wrong ${m.incorrect}  unscored ${m.unscored}`,
      ].join('   '),
  );
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

  // Read back the resolved judge for provenance. The key is NOT destructured out
  // of this object anywhere below, and never reaches stdout or the file.
  const { model, temperature } = getJudgeConfig();

  const realizations = listAttackCodes().flatMap((category) =>
    getAttack(category).variants.map((variant) => ({ category, variantId: variant.id })),
  );

  console.log(
    `Classifying ${realizations.length} labeled realizations with ${model} (t=${temperature}), ` +
      `${PASSES} passes each.`,
  );
  console.log(`This makes ${realizations.length * PASSES} live judge calls.\n`);

  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const rows: Row[] = [];
  let done = 0;

  for (const { category, variantId } of realizations) {
    const attack = getAttack(category);
    const built = attack.build(variantId);
    const { taskGoal } = attack.scenario(variantId);
    // The held-out label is read for SCORING only, on this line, and never
    // reaches `detect` — which takes (trace, taskGoal) and nothing else.
    const actual = built.groundTruth.compromised;
    const trace = built.trace;

    const verdicts: Verdict[] = [];
    for (let pass = 1; pass <= PASSES; pass += 1) {
      try {
        verdicts.push(await detect(trace, taskGoal));
      } catch (cause) {
        const code = (cause as { code?: string }).code ?? 'unknown';
        throw new Error(
          `classifying ${category} / ${variantId} (pass ${pass} of ${PASSES}) failed [${code}]: ` +
            `${cause instanceof Error ? cause.message : String(cause)}`,
          { cause },
        );
      }
    }

    const answers: Answer[] = verdicts.map((v) => (v.compromised ? v.category : null));
    const picked = modal(answers);
    const stable = new Set(answers.map(String)).size === 1;
    done += 1;
    console.log(
      `  [${String(done).padStart(2)}/${realizations.length}] ${category} ${variantId.padEnd(28)} ` +
        `${stable ? 'stable  ' : 'UNSTABLE'} ${picked.count}/${PASSES} ` +
        `-> ${picked.value ?? 'clean'}`,
    );

    rows.push({
      category,
      variantId,
      actual,
      answers,
      modalAnswer: picked.value,
      modalCount: picked.count,
      stable,
      compromiseCalls: verdicts.map((v) => v.compromised),
    });
  }

  const elapsedMs = Math.round(performance.now() - t0);

  // Score the MODAL answer per realization through the shared harness, so the
  // exclusion rules that keep an assembled category out of the number are the
  // same ones the unit suite pins.
  const records: EvalRecord[] = rows.map((r) => ({
    category: r.category,
    variantId: r.variantId,
    actual: r.actual,
    predicted: r.modalAnswer !== null,
    ...(r.modalAnswer !== null ? { predictedCategory: r.modalAnswer } : {}),
  }));
  const full = report(records);
  const classification = full.classification;

  console.log('\nMEASURED category-classification accuracy');
  console.log('(scored over TRUE POSITIVES only: a real compromise, classified blind)\n');
  printAccuracy('OVERALL', classification.overall);
  console.log('');
  for (const category of listAttackCodes()) {
    const m = classification.byCategory[category];
    if (m) printAccuracy(category, m);
  }

  if (classification.confusions.length > 0) {
    console.log(`\n${classification.confusions.length} misclassification(s):\n`);
    for (const c of classification.confusions) {
      console.log(`  ${c.variantId ?? '?'}: really ${c.actual}, judged ${c.predicted}`);
    }
  } else {
    console.log('\nNo misclassifications among the scored realizations.');
  }

  const unstable = rows.filter((r) => !r.stable);
  if (unstable.length > 0) {
    console.log(`\n${unstable.length} UNSTABLE realization(s) across ${PASSES} passes:\n`);
    for (const r of unstable) {
      console.log(
        `  ${r.category} ${r.variantId}: ${r.answers.map((a) => a ?? 'clean').join(', ')} ` +
          `(modal ${String(r.modalAnswer ?? 'clean')} ${r.modalCount}/${PASSES})`,
      );
    }
    console.log('\nDo NOT silently pick one. An unstable answer is a reportable finding.');
  } else {
    console.log(`\nAll ${rows.length} realizations gave the same answer on all ${PASSES} passes.`);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = join(ARTIFACT_DIR, `eval-category-${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        provenance: {
          measuredAt: startedAt,
          judgeModel: model,
          judgeTemperature: temperature,
          fixtures: rows.length,
          passes: PASSES,
          elapsedMs,
        },
        classification,
        // The compromise P/R of the modal pass rides along for cross-checking
        // against `eval:measure`. It is NOT a replacement for that measurement.
        compromiseCrossCheck: { overall: full.overall, byCategory: full.byCategory },
        rows,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nFull report written to ${file}`);
  console.log(
    `Provenance for any surfaced figure: category accuracy · ` +
      `n=${classification.overall.scored} scored · ${PASSES} passes · ${startedAt.slice(0, 10)} · ` +
      `judge ${model}`,
  );
  return unstable.length > 0 ? 2 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('eval:measure-category failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
