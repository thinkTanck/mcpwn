import { RunResultSchema } from '@/contract';
import { getDataSource, SAMPLE_RUN_ID } from '@/data/source';
import { asi06Run } from '@/data/fixtures/asi06-trace';
import { leaderboardFixture } from '@/data/fixtures/leaderboard';
import { findingsFixture } from '@/data/fixtures/findings';

/** Recursively true if `key` appears anywhere in the object graph. */
function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (key in record) return true;
    return Object.values(record).some((v) => hasKeyDeep(v, key));
  }
  return false;
}

describe('DataSource (in-memory)', () => {
  const ds = getDataSource();

  it('the sample run is a schema-valid RunResult with no groundTruth', () => {
    expect(() => RunResultSchema.parse(asi06Run)).not.toThrow();
    expect(Object.keys(asi06Run)).not.toContain('groundTruth');
  });

  it('leakage barrier: no fixture leaks a held-out label anywhere in its graph', () => {
    for (const fixture of [asi06Run, leaderboardFixture, findingsFixture]) {
      expect(hasKeyDeep(fixture, 'groundTruth')).toBe(false);
    }
    // No observable trace step carries an out-of-band label / compromise flag —
    // the offending step is knowable only via the detector's verdict.stepId.
    for (const step of asi06Run.trace.steps) {
      expect(hasKeyDeep(step, 'label')).toBe(false);
      expect(hasKeyDeep(step, 'compromiseFlag')).toBe(false);
    }
  });

  it('verdict.stepId anchors to a real step (never a phantom id)', () => {
    const ids = asi06Run.trace.steps.map((s) => s.id);
    expect(asi06Run.verdict.stepId).toBeDefined();
    expect(ids).toContain(asi06Run.verdict.stepId);
  });

  it('getRun resolves by canonical id and the "sample" alias, null otherwise', async () => {
    expect(await ds.getRun(SAMPLE_RUN_ID)).toEqual(asi06Run);
    expect(await ds.getRun('sample')).toEqual(asi06Run);
    expect(await ds.getRun('nope')).toBeNull();
  });

  it('getLeaderboard returns 3 rows × 5 cells, overall = mean, fixture-labelled', async () => {
    const lb = await ds.getLeaderboard();
    expect(lb.source).toBe('fixture');
    expect(lb.rows).toHaveLength(3);
    for (const row of lb.rows) {
      expect(row.cells).toHaveLength(5);
      const mean = row.cells.reduce((a, c) => a + c.robustness, 0) / row.cells.length;
      expect(row.overall).toBeCloseTo(mean, 5);
    }
  });

  it('getFixReport returns the report for the sample run, null otherwise', async () => {
    const report = await ds.getFixReport('RG-0472');
    expect(report?.stepId).toBe('s11');
    expect(report?.remediation).toHaveLength(5);
    expect(await ds.getFixReport('nope')).toBeNull();
  });
});
