/**
 * CLASSIFICATION RELIABILITY — the rule that decides whether a fix report is
 * allowed to derive guidance from the category the detector returned.
 *
 * Two different questions were measured, and they came out very differently:
 *
 *   - THE COMPROMISE CALL is reliable. Precision 0.9565, recall 1.0000, zero
 *     false negatives in any category on any pass. The detector finds the
 *     compromise and anchors the offending step.
 *   - THE FILING is not. Category accuracy is 0.6818 over the 22 realizations
 *     where the question is well posed, and ASI10 scores ZERO: every rogue-agent
 *     realization is read as ASI01 or ASI03 instead.
 *
 * Remediation is keyed off the category, so a staged ASI10 run currently ships
 * ASI01 remediation as if it were authoritative. That is confident guidance
 * derived from a classification that has never once been right, and this module
 * exists to stop it at the point of use, without touching the frozen judge.
 *
 * PROVENANCE OF THE TABLE BELOW. The aggregate and its provenance line are
 * IMPORTED from `src/eval/measured.ts` and never re-typed here. The per-class
 * rows are the breakdown that measurement reported, reconciled arithmetically
 * against it: `measured.ts` states ASI02/ASI05/ASI06 at 1.0000, ASI01/ASI03/
 * ASI04 at 0.6667 (one miss each), ASI10 at 0.0000 (0 of 4), over n=22. Three
 * classes at 2/3 and one at 0/4 accounts for 13 of the 22, leaving 3 each for
 * the three perfect classes: 15 correct of 22 scored, which is the published
 * 0.6818 exactly. `tests/unit/fix-report/classification.test.ts` asserts that
 * reconciliation, so a row cannot be edited to make a screen read better.
 *
 * WHERE THIS BELONGS. Beside the aggregate in `src/eval/measured.ts`, as the
 * per-class view of the same measurement. It is recorded here because this wave
 * changed only the point of use and left the measurement file byte-unchanged;
 * moving it is tracked in plan.md with the category-v2 rubric work.
 */
import type { Category } from '@/contract';
import { MEASURED_CLASSIFICATION, MEASURED_CLASSIFICATION_PROVENANCE } from '@/eval/measured';

/** One class's measured classification tally: correct of scored. */
export interface ClassScore {
  correct: number;
  scored: number;
}

/**
 * MEASURED category-classification, per class (2026-08-04, judge
 * `claude-haiku-4-5`, temperature 0). Same measurement as
 * `MEASURED_CLASSIFICATION`, broken out; it sums back to it exactly.
 */
export const MEASURED_CLASSIFICATION_BY_CATEGORY: Record<Category, ClassScore> = {
  ASI01: { correct: 2, scored: 3 },
  ASI02: { correct: 3, scored: 3 },
  ASI03: { correct: 2, scored: 3 },
  ASI04: { correct: 2, scored: 3 },
  ASI05: { correct: 3, scored: 3 },
  ASI06: { correct: 3, scored: 3 },
  ASI10: { correct: 0, scored: 4 },
};

/** What a report is entitled to claim about its own category. */
export interface ClassificationReliability {
  /**
   * false when the staged class scored ZERO correct: nothing about filing this
   * class is measured to work, so no guidance may be derived from it. The bar is
   * deliberately zero rather than an invented threshold like 0.8 — we have a
   * measurement, not a taste for round numbers.
   */
  reliable: boolean;
  /** The staged class's own measured tally. */
  classScore: ClassScore;
  /** The published aggregate, imported, never re-typed. */
  accuracy: number;
  scored: number;
  provenance: string;
}

/**
 * Decide what may be claimed for a run that STAGED `category` (the environment
 * our MCP endpoint served), which is what the measurement is indexed by. It is
 * deliberately not indexed by the category the detector returned: for the class
 * that fails, the returned code is precisely the thing under suspicion.
 */
export function classificationReliability(category: Category): ClassificationReliability {
  const classScore = MEASURED_CLASSIFICATION_BY_CATEGORY[category];
  return {
    reliable: classScore.correct > 0,
    classScore,
    accuracy: MEASURED_CLASSIFICATION.accuracy,
    scored: MEASURED_CLASSIFICATION.scored,
    provenance: MEASURED_CLASSIFICATION_PROVENANCE,
  };
}
