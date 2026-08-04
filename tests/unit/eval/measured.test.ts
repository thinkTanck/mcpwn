import {
  MEASURED_CLASSIFICATION,
  MEASURED_CLASSIFICATION_PROVENANCE,
  MEASURED_COMPROMISE,
  MEASURED_COMPROMISE_PROVENANCE,
} from '@/eval/measured';

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
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/N=44 labeled realizations/);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/5 passes/);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(PROVENANCE_DATE);
    expect(MEASURED_COMPROMISE_PROVENANCE).toMatch(/judge claude-haiku-4-5/);
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
    // true positives are scorable. A provenance line quoting N=44 here would be
    // borrowing the P/R's denominator for a number that never used it.
    expect(MEASURED_CLASSIFICATION_PROVENANCE).toContain(String(MEASURED_CLASSIFICATION.scored));
    expect(MEASURED_CLASSIFICATION.scored).toBeLessThan(44);
    expect(MEASURED_CLASSIFICATION_PROVENANCE).not.toMatch(/N=44/);
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
