import {
  MEASURED_CLASSIFICATION,
  MEASURED_CLASSIFICATION_PROVENANCE,
  MEASURED_COMPROMISE,
  MEASURED_COMPROMISE_PROVENANCE,
} from '@/eval/measured';
import { getAttack, listAttackCodes } from '@/attacks';

/**
 * The number of labeled realizations the eval harness actually scores. The
 * published compromise provenance quotes this as its denominator, so the two must
 * agree: adding fixtures (for example the benign-exploration controls) changes this
 * count, and the published figure is stale until it has been RE-MEASURED over the
 * new set. This coupling is what makes the measurement fall out of date loudly.
 */
const REALIZATION_COUNT = listAttackCodes().reduce(
  (n, code) => n + getAttack(code).variants.length,
  0,
);

/**
 * The PUBLISHED measurements, and the guard that keeps them honest.
 *
 * Two separate measurements now reach the screens: the compromise call
 * (precision/recall) and the category classification (accuracy). They come from
 * two different scripts, over two different denominators, and answer two
 * different questions. The failure mode this file exists to prevent is them
 * being merged into one "detector accuracy" figure, or either one shedding the
 * provenance that makes it checkable.
 */

const PROVENANCE_DATE = /\d{4}-\d{2}-\d{2}/;

describe('the published compromise P/R', () => {
  it('is a real figure in [0,1] with full provenance beside it', () => {
    expect(MEASURED_COMPROMISE.precision).toBeGreaterThan(0);
    expect(MEASURED_COMPROMISE.precision).toBeLessThanOrEqual(1);
    expect(MEASURED_COMPROMISE.recall).toBeGreaterThan(0);
    expect(MEASURED_COMPROMISE.recall).toBeLessThanOrEqual(1);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/^measured · /);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/N=\d+ labeled realizations/);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/5 passes/);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(PROVENANCE_DATE);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/judge claude-haiku-4-5/);
  });

  it('quotes a denominator that matches the actual labeled fixture count', () => {
    // If this fails, fixtures were added or removed without re-measuring: the
    // published P/R no longer describes the set the harness would score.
    const match = MEASURED_COMPROMISE_PROVENANCE.match(/N=(\d+) labeled realizations/);
    expect(match, 'provenance must state N=<count> labeled realizations').not.toBeNull();
    expect(Number(match![1])).toBe(REALIZATION_COUNT);
  });
});

describe('the published category-classification accuracy', () => {
  it('is a real figure in [0,1] scored over a stated, non-empty denominator', () => {
    expect(MEASURED_CLASSIFICATION.accuracy).toBeGreaterThan(0);
    expect(MEASURED_CLASSIFICATION.accuracy).toBeLessThanOrEqual(1);
    expect(MEASURED_CLASSIFICATION.scored).toBeGreaterThan(0);
  });

  it('carries its OWN provenance, in the required shape', () => {
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toMatch(/^category accuracy · /);
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toMatch(/5 passes/);
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toMatch(PROVENANCE_DATE);
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toMatch(/judge claude-haiku-4-5/);
  });

  it('states the denominator it was scored over, and that denominator is the real one', () => {
    // The classification denominator is SMALLER than the fixture count: only the
    // true positives are scorable. A provenance line quoting the P/R's N= here would
    // be borrowing that denominator for a number that never used it.
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toContain(String(MEASURED_CLASSIFICATION.scored));
    expect(MEASURED_CLASSIFICATION.scored).toBeLessThan(REALIZATION_COUNT);
    expect(MEASURED_CLASSIFICATION_PROVENANCE).not.toMatch(/N=/);
  });

  it('is never described as precision or recall — it is neither', () => {
    expect(MEASURED_CLASSIFICATION_PROVENANCE).not.toMatch(/precision|recall/i);
    expect(MEASURED_CLASSIFICATION).not.toHaveProperty('precision');
    expect(MEASURED_CLASSIFICATION).not.toHaveProperty('recall');
  });

  it('is a DIFFERENT provenance line from the compromise one', () => {
    expect(MEASURED_CLASSIFICATION_PROVENANCE).not.toBe(MEASURED_COMPROMISE_PROVENANCE);
  });
});
