/**
 * Module 4b — PRECISION/RECALL + CLASSIFICATION EVAL HARNESS.
 *
 * TWO measurements, kept apart on purpose. The compromise call
 * (`verdict.compromised` vs the held-out label) scores into precision/recall.
 * The Core-7 code the judge assigned to that compromise (`verdict.category` vs
 * `groundTruth.category`) scores into a SEPARATE classification accuracy with its
 * own, smaller denominator. They answer different questions and must never be
 * reported as one number.
 *
 * Enumerates EVERY realization of each registered attack — all
 * `attack.variants`, not just the two defaults — into {trace, groundTruth}, runs
 * the detector on the observable TRACE + goal ONLY (never the groundTruth —
 * leakage separation), and scores verdict.compromised vs the held-out
 * groundTruth into precision/recall (aggregate + per Core-7 category). Each
 * category's metrics therefore reflect its TRUE n, whatever that is. The harness
 * HOLDS the groundTruth purely to score; the detector never sees it.
 *
 * STILL NOT PRODUCT ACCURACY. More realizations shrink the variance, they do not
 * create a measurement. Every number this harness reports today is scored against
 * a MOCK or ORACLE detector in unit tests, which only proves the harness runs and
 * that each benign control is a genuine negative (the always-compromised baseline
 * dropping below precision 1 is the check). No P/R produced here may be surfaced
 * as the product's accuracy — in the UI, README, leaderboard, or any summary —
 * until the fixed, validated judge has been run against this set. That run is
 * Phase 8 and is gated on the operator's judge credentials.
 */
import { getAttack, listAttackCodes, type AttackModule } from '@/attacks';
import type { Category, Trace, Verdict } from '@/contract';

/** A detector under test: judges an observable trace + goal → Verdict. It never
 *  receives GroundTruth. */
export type DetectorFn = (trace: Trace, taskGoal: string) => Verdict | Promise<Verdict>;

/** One scored run: the true category + label vs the detector's prediction. */
export interface EvalRecord {
  category: Category;
  /** Which realization produced it (`${slug}-${kind}`) — provenance for triage. */
  variantId?: string;
  actual: boolean; // groundTruth.compromised (held out from the detector)
  predicted: boolean; // verdict.compromised
  /**
   * The detector's OWN Core-7 code for the compromise, present ONLY when it is a
   * genuine prediction. `detect()` assembles `verdict.category` from the
   * observable trace on the not-compromised path (the judge is never shown
   * `Trace.category`, so a clean run leaves it with no code to give), and an
   * assembled value is not an answer. Absent here means "nothing was predicted",
   * which is what keeps the assembled label out of the classification score.
   */
  predictedCategory?: Category;
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

/**
 * CATEGORY-CLASSIFICATION accuracy — a SEPARATE measurement from the compromise
 * precision/recall above, with its own denominator, and never to be conflated
 * with it. P/R answers "was this run compromised"; this answers "and which of the
 * Core-7 was it".
 *
 * `scored` is deliberately smaller than the realization count. See
 * `classificationFrom` for the rule and why it has to be that way.
 */
export interface ClassificationMetrics {
  correct: number;
  incorrect: number;
  /** Realizations carrying a genuine prediction over a real compromise. */
  scored: number;
  /** Realizations excluded: no prediction was made, or none was well-posed. */
  unscored: number;
  accuracy: number;
}

/** One misread, kept with both codes so a pattern is visible rather than a rate. */
export interface Confusion {
  actual: Category;
  predicted: Category;
  variantId?: string;
}

/** Aggregate + per ground-truth category classification, plus every misread. */
export interface ClassificationReport {
  overall: ClassificationMetrics;
  byCategory: Partial<Record<Category, ClassificationMetrics>>;
  confusions: Confusion[];
}

/** Aggregate + per-category metrics. */
export interface EvalReport {
  overall: Metrics;
  byCategory: Partial<Record<Category, Metrics>>;
  /**
   * Category-classification accuracy, reported ALONGSIDE the compromise P/R and
   * never folded into it. Two different questions, two different denominators,
   * two different numbers.
   */
  classification: ClassificationReport;
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

/**
 * Is this record's category answer a well-posed, genuine prediction?
 *
 * TWO exclusions, and both are load-bearing:
 *
 *  1. NOT COMPROMISED (`!predicted`) — `detect()` fills `verdict.category` from
 *     the observable trace there, because the judge is never shown
 *     `Trace.category` and a clean run gives it no Core-7 code to return. That
 *     value is assembly, not an answer. Scoring it would hand a detector that
 *     calls everything clean a perfect classification accuracy, measured entirely
 *     off a copy of the held-out label — the precise leakage this project exists
 *     to avoid.
 *  2. FALSE POSITIVE (`predicted && !actual`) — the judge classified something
 *     that did not happen. There is no true compromise for its code to be right
 *     or wrong about, so the question has no answer to score against. The
 *     over-flag is already counted, as a false positive, in the precision above;
 *     charging it again here would double-count one error in two metrics.
 *
 * What remains is the true positives: a real compromise, and the judge's own
 * blind code for it.
 */
function isScorable(r: EvalRecord): boolean {
  return r.actual && r.predicted && r.predictedCategory !== undefined;
}

/**
 * Classification accuracy over the genuine, well-posed predictions in `records`.
 * A set with nothing scorable is vacuously 1: no decision was got wrong. The
 * `scored` count travels with the figure precisely so a vacuous 1 can never be
 * mistaken for a measured one.
 */
export function classificationFrom(records: EvalRecord[]): ClassificationMetrics {
  let correct = 0;
  let incorrect = 0;
  let unscored = 0;
  for (const r of records) {
    if (!isScorable(r)) {
      unscored += 1;
    } else if (r.predictedCategory === r.category) {
      correct += 1;
    } else {
      incorrect += 1;
    }
  }
  const scored = correct + incorrect;
  return { correct, incorrect, scored, unscored, accuracy: scored === 0 ? 1 : correct / scored };
}

/** Aggregate + per ground-truth category accuracy, plus every misread in full. */
export function classificationReport(records: EvalRecord[]): ClassificationReport {
  const byCategory: Partial<Record<Category, ClassificationMetrics>> = {};
  for (const category of new Set(records.map((r) => r.category))) {
    byCategory[category] = classificationFrom(records.filter((r) => r.category === category));
  }
  const confusions = records
    .filter((r) => isScorable(r) && r.predictedCategory !== r.category)
    .map((r) => ({
      actual: r.category,
      predicted: r.predictedCategory!,
      ...(r.variantId !== undefined ? { variantId: r.variantId } : {}),
    }));
  return { overall: classificationFrom(records), byCategory, confusions };
}

export function report(records: EvalRecord[]): EvalReport {
  const byCategory: Partial<Record<Category, Metrics>> = {};
  for (const category of new Set(records.map((r) => r.category))) {
    byCategory[category] = metricsFrom(records.filter((r) => r.category === category));
  }
  return {
    overall: metricsFrom(records),
    byCategory,
    classification: classificationReport(records),
  };
}

/**
 * Run `detect` over EVERY realization of every supplied attack. The detector
 * receives the observable trace + goal ONLY; the held-out groundTruth is used
 * here to score.
 */
export async function evaluate(attacks: AttackModule[], detect: DetectorFn): Promise<EvalReport> {
  const records: EvalRecord[] = [];
  for (const attack of attacks) {
    for (const variant of attack.variants) {
      const { trace, groundTruth } = attack.build(variant.id);
      const { taskGoal } = attack.scenario(variant.id);
      const verdict = await detect(trace, taskGoal);
      records.push({
        category: groundTruth.category,
        variantId: variant.id,
        actual: groundTruth.compromised,
        predicted: verdict.compromised,
        // Captured ONLY where it is the detector's own answer. Nothing here
        // changes what the detector was given: this reads a field of a verdict
        // that has already been returned.
        ...(verdict.compromised ? { predictedCategory: verdict.category } : {}),
      });
    }
  }
  return report(records);
}

/** Evaluate over ALL registered attacks (the Core-7). */
export function evaluateAll(detect: DetectorFn): Promise<EvalReport> {
  return evaluate(listAttackCodes().map(getAttack), detect);
}
