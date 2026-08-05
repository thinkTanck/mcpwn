import { CategorySchema, type Category } from '@/contract';
import { MEASURED_CLASSIFICATION, MEASURED_CLASSIFICATION_PROVENANCE } from '@/eval/measured';
import {
  MEASURED_CLASSIFICATION_BY_CATEGORY,
  classificationReliability,
} from '@/fix-report/classification';

/**
 * The per-class classification table is only trustworthy if it RECONCILES with
 * the published aggregate it was broken out of. These tests are that check: the
 * per-category tallies must sum to the same denominator and round to the same
 * accuracy `src/eval/measured.ts` publishes. If someone edits a row to make a
 * screen read better, the arithmetic stops matching and this fails.
 */
describe('MEASURED_CLASSIFICATION_BY_CATEGORY', () => {
  const rows = Object.values(MEASURED_CLASSIFICATION_BY_CATEGORY);
  const correct = rows.reduce((n, r) => n + r.correct, 0);
  const scored = rows.reduce((n, r) => n + r.scored, 0);

  it('has a row for every Core-7 category', () => {
    for (const category of CategorySchema.options) {
      expect(MEASURED_CLASSIFICATION_BY_CATEGORY[category]).toBeDefined();
    }
    expect(rows).toHaveLength(CategorySchema.options.length);
  });

  it('sums to the published denominator (n=22 scored, not the 44 of the P/R line)', () => {
    expect(scored).toBe(MEASURED_CLASSIFICATION.scored);
  });

  it('sums to the published accuracy, to the published precision', () => {
    expect(Number((correct / scored).toFixed(4))).toBe(MEASURED_CLASSIFICATION.accuracy);
  });

  it('records ASI10 at zero correct: the whole class, not an unlucky sample', () => {
    expect(MEASURED_CLASSIFICATION_BY_CATEGORY.ASI10).toEqual({ correct: 0, scored: 4 });
  });

  it('never records more correct than scored', () => {
    for (const row of rows) {
      expect(row.correct).toBeGreaterThanOrEqual(0);
      expect(row.correct).toBeLessThanOrEqual(row.scored);
      expect(row.scored).toBeGreaterThan(0);
    }
  });
});

describe('classificationReliability', () => {
  it('is UNRELIABLE exactly for the classes measured at zero correct', () => {
    for (const category of CategorySchema.options) {
      const measured = MEASURED_CLASSIFICATION_BY_CATEGORY[category];
      expect(classificationReliability(category).reliable).toBe(measured.correct > 0);
    }
  });

  it('marks ASI10 unreliable and carries its measured tally', () => {
    const r = classificationReliability('ASI10');
    expect(r.reliable).toBe(false);
    expect(r.classScore).toEqual({ correct: 0, scored: 4 });
  });

  it('leaves a class that scored above zero reading normally', () => {
    const r = classificationReliability('ASI02');
    expect(r.reliable).toBe(true);
    expect(r.classScore.correct).toBeGreaterThan(0);
  });

  it('carries the published aggregate figure and its provenance, never a re-typed numeral', () => {
    const r = classificationReliability('ASI06' as Category);
    expect(r.accuracy).toBe(MEASURED_CLASSIFICATION.accuracy);
    expect(r.scored).toBe(MEASURED_CLASSIFICATION.scored);
    expect(r.provenance).toBe(MEASURED_CLASSIFICATION_PROVENANCE);
  });
});
