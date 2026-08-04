/**
 * `npx tsx scripts/record-sample-verdicts.ts` — RECORD the sample-playback
 * verdicts from the frozen validated judge.
 *
 * The sample traces served by `src/data/source.ts` are real builder output and do
 * not change here. Only the VERDICTS do: for each Core-7 category this drives the
 * frozen judge (SYSTEM_RUBRIC + the pinned model + the pinned temperature) over
 * the same observable trace the screens render, FIVE times, and reports the MODAL
 * verdict together with the per-pass spread.
 *
 * Five passes, not one, because the judge is not guaranteed deterministic at
 * temperature 0 (the 2026-08-02 measurement flipped one of 44 verdicts across
 * three passes). A single pass would be luck presented as a recording. Anything
 * that varies across the five is REPORTED as unstable rather than silently
 * resolved by picking a pass.
 *
 * Nothing here can see a held-out label: `resolveLiveDetector()` returns a
 * `(trace, taskGoal) => Verdict` and the `groundTruth` half of `build()` is
 * dropped on the line it is produced. The recorded `stepId` is the judge's own
 * answer over `judgeableTrace()`, so it cannot be a copy of `GroundTruth.stepId`.
 *
 * Reads `JUDGE_MODEL`, `JUDGE_BASE_URL`, `JUDGE_API_KEY` and `JUDGE_TEMPERATURE`
 * from the environment (`.env.local` is loaded automatically). With no judge
 * credential it exits non-zero rather than inventing a verdict. The key is never
 * printed and never written to the artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { getAttack } from '@/attacks';
import { getJudgeConfig } from '@/config/env';
import { CategorySchema, type Category, type Verdict } from '@/contract';
import { resolveLiveDetector } from '@/detector/resolve';

/** Where recordings land. Gitignored: evidence, not source. */
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'eval');

/** How many passes make a recording. */
const PASSES = 5;

/** The decision fields a sample verdict is judged STABLE on. */
function decisionKey(v: Verdict): string {
  return JSON.stringify([v.compromised, v.category, v.severity, v.stepId ?? null]);
}

/** Most frequent value, ties broken by earliest occurrence. */
function modal<T>(values: readonly T[], key: (v: T) => string): { value: T; count: number } {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(key(v), (counts.get(key(v)) ?? 0) + 1);
  let best: { value: T; count: number } | undefined;
  for (const v of values) {
    const count = counts.get(key(v)) ?? 0;
    if (best === undefined || count > best.count) best = { value: v, count };
  }
  if (best === undefined) throw new Error('modal() needs at least one value');
  return best;
}

interface Recording {
  category: Category;
  runId: string;
  passes: Verdict[];
  modal: Verdict;
  modalCount: number;
  stable: boolean;
  distinctDecisions: string[];
}

async function main(): Promise<number> {
  loadEnvConfig(process.cwd());

  const detect = resolveLiveDetector();
  if (!detect) {
    console.error(
      'No judge is configured, so there is nothing to record.\n' +
        'Set JUDGE_MODEL, JUDGE_BASE_URL and JUDGE_API_KEY in .env.local and run again.\n' +
        'Refusing to write a verdict that was not produced by the validated judge.',
    );
    return 1;
  }

  const { model, temperature } = getJudgeConfig();
  const categories = CategorySchema.options;
  console.log(
    `Recording ${categories.length} sample verdicts with ${model} (t=${temperature}), ` +
      `${PASSES} passes each.\n`,
  );

  const startedAt = new Date().toISOString();
  const recordings: Recording[] = [];

  for (const category of categories) {
    const attack = getAttack(category);
    // The held-out label is never bound to a name: only `trace` leaves this line.
    const { trace } = attack.build('malicious');
    const { taskGoal } = attack.scenario('malicious');

    const passes: Verdict[] = [];
    for (let pass = 1; pass <= PASSES; pass += 1) {
      const verdict = await detect(trace, taskGoal);
      passes.push(verdict);
      console.log(
        `  ${category} pass ${pass}/${PASSES}  ` +
          `${verdict.compromised ? 'compromised' : 'clean      '}  ` +
          `${(verdict.stepId ?? '-').padEnd(5)}  ${verdict.severity.padEnd(8)} ${verdict.score}`,
      );
    }

    const decisions = passes.map(decisionKey);
    const distinctDecisions = [...new Set(decisions)];
    const picked = modal(passes, decisionKey);
    // Within the modal decision, take the modal rationale/score so the recorded
    // prose belongs to the same answer as the recorded stepId.
    const agreeing = passes.filter((v) => decisionKey(v) === decisionKey(picked.value));
    const rationale = modal(agreeing, (v) => v.rationale).value.rationale;
    const score = modal(agreeing, (v) => String(v.score)).value.score;

    recordings.push({
      category,
      runId: trace.runId,
      passes,
      modal: { ...picked.value, rationale, score },
      modalCount: picked.count,
      stable: distinctDecisions.length === 1,
      distinctDecisions,
    });
    console.log('');
  }

  console.log('MODAL sample verdicts\n');
  for (const r of recordings) {
    const flag = r.stable ? 'stable  ' : 'UNSTABLE';
    console.log(
      `  ${r.category}  ${flag}  ${r.modalCount}/${PASSES}  ` +
        `${r.modal.compromised ? 'compromised' : 'clean'}  step ${r.modal.stepId ?? '-'}  ` +
        `${r.modal.severity}  ${r.modal.score}`,
    );
    console.log(`    ${r.modal.rationale}`);
  }

  const unstable = recordings.filter((r) => !r.stable);
  if (unstable.length > 0) {
    console.log(`\n${unstable.length} UNSTABLE recording(s) — do NOT silently pick one:\n`);
    for (const r of unstable) {
      console.log(`  ${r.category}: ${r.distinctDecisions.length} distinct decisions`);
      for (const d of r.distinctDecisions) console.log(`    ${d}`);
    }
  } else {
    console.log(`\nAll ${recordings.length} recordings agreed across all ${PASSES} passes.`);
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = join(ARTIFACT_DIR, `sample-verdicts-${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        provenance: {
          recordedAt: startedAt,
          judgeModel: model,
          judgeTemperature: temperature,
          passes: PASSES,
        },
        recordings,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nFull recording written to ${file}`);
  return unstable.length > 0 ? 2 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('record-sample-verdicts failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
