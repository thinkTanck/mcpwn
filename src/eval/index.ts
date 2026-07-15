/**
 * Module 4b — PRECISION/RECALL EVAL HARNESS.
 *
 * Enumerates each registered attack × {malicious, benign} → {trace, groundTruth},
 * runs the detector on the observable TRACE + goal ONLY (never the groundTruth —
 * leakage separation), and scores verdict.compromised vs the held-out
 * groundTruth into precision/recall (aggregate + per Core-7 category). The
 * harness HOLDS the groundTruth purely to score; the detector never sees it.
 *
 * NOT A MEASUREMENT — SMOKE TEST ONLY: with one malicious + one benign variant
 * per category (n = 2 per category), a reported P/R — e.g. 1.0 against a
 * mock/oracle detector — only proves the harness runs and that each benign
 * control is a genuine negative. It is NOT product accuracy and must NEVER be
 * surfaced as such (UI, README, leaderboard, or any summary). Trustworthy
 * measured P/R needs many realizations per category and the validated judge
 * (Phase 8 — see plan.md's variant-count prerequisite).
 */
import { getAttack, listAttackCodes, type AttackModule } from '@/attacks';
import type { Category, Trace, Verdict } from '@/contract';

/** A detector under test: judges an observable trace + goal → Verdict. It never
 *  receives GroundTruth. */
export type DetectorFn = (trace: Trace, taskGoal: string) => Verdict | Promise<Verdict>;

/** One scored run: the true category + label vs the detector's prediction. */
export interface EvalRecord {
  category: Category;
  actual: boolean; // groundTruth.compromised (held out from the detector)
  predicted: boolean; // verdict.compromised
}

/** Precision/recall + confusion counts. */
export interface Metrics {
  precision: number;
  recall: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  total: number;
}

/** Aggregate + per-category metrics. */
export interface EvalReport {
  overall: Metrics;
  byCategory: Partial<Record<Category, Metrics>>;
}

/**
 * Confusion matrix → precision/recall over "compromised" as the positive class.
 * Empty and no-positive cases score vacuously 1 (no false decisions to penalize).
 */
export function metricsFrom(records: EvalRecord[]): Metrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of records) {
    if (r.actual && r.predicted) tp += 1;
    else if (!r.actual && r.predicted) fp += 1;
    else if (r.actual && !r.predicted) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  return { precision, recall, tp, fp, fn, tn, total: records.length };
}

function report(records: EvalRecord[]): EvalReport {
  const byCategory: Partial<Record<Category, Metrics>> = {};
  for (const category of new Set(records.map((r) => r.category))) {
    byCategory[category] = metricsFrom(records.filter((r) => r.category === category));
  }
  return { overall: metricsFrom(records), byCategory };
}

/**
 * Run `detect` over each attack × {malicious, benign}. The detector receives the
 * observable trace + goal ONLY; the held-out groundTruth is used here to score.
 */
export async function evaluate(attacks: AttackModule[], detect: DetectorFn): Promise<EvalReport> {
  const records: EvalRecord[] = [];
  for (const attack of attacks) {
    for (const variant of ['malicious', 'benign'] as const) {
      const { trace, groundTruth } = attack.build(variant);
      const { taskGoal } = attack.scenario(variant);
      const verdict = await detect(trace, taskGoal);
      records.push({
        category: groundTruth.category,
        actual: groundTruth.compromised,
        predicted: verdict.compromised,
      });
    }
  }
  return report(records);
}

/** Evaluate over ALL registered attacks (the Core-7). */
export function evaluateAll(detect: DetectorFn): Promise<EvalReport> {
  return evaluate(listAttackCodes().map(getAttack), detect);
}
