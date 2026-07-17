import { RunResultSchema, CategorySchema, type Category } from '@/contract';
import { getDataSource, SAMPLE_RUN_ID, sampleRun } from '@/data/source';
import { leaderboardFixture } from '@/data/fixtures/leaderboard';
import { findingsFixture } from '@/data/fixtures/findings';
import { getAttack } from '@/attacks';

// GUARDRAIL SPY: wrap every attack build result so any read of its `groundTruth`
// key is recorded. The DataSource must assemble samples from the observable
// `trace` ONLY — it must never touch the held-out label.
const { gtReads } = vi.hoisted(() => ({ gtReads: new Set<string>() }));
vi.mock('@/attacks', async (importActual) => {
  const actual = await importActual<typeof import('@/attacks')>();
  return {
    ...actual,
    getAttack: (category: Category) => {
      const real = actual.getAttack(category);
      return {
        ...real,
        build: (variant: string) => {
          const result = real.build(variant);
          return new Proxy(result, {
            get(target, prop, receiver) {
              if (prop === 'groundTruth') gtReads.add(category);
              return Reflect.get(target, prop, receiver);
            },
          });
        },
      };
    },
  };
});

const CATEGORIES = CategorySchema.options;

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

describe('DataSource — sample runs served from the real attack builders', () => {
  const ds = getDataSource();

  it('serves a schema-valid, unlabeled sample RunResult for all seven categories', async () => {
    const runs = await ds.listRuns();
    expect(runs).toHaveLength(7);
    expect([...new Set(runs.map((r) => r.category))].sort()).toEqual([...CATEGORIES].sort());
    for (const r of runs) {
      expect(() => RunResultSchema.parse(r)).not.toThrow();
      expect(Object.keys(r)).not.toContain('groundTruth');
    }
  });

  it("each sample's trace IS the builder-constructed attack, not a hand-authored mock", () => {
    for (const cat of CATEGORIES) {
      const run = sampleRun(cat);
      const builderTrace = getAttack(cat).build('malicious').trace;
      expect(run.trace).toEqual(builderTrace);
      // run / trace / verdict all agree on the builder's run id (single source of truth)
      expect(run.runId).toBe(builderTrace.runId);
      expect(run.trace.runId).toBe(builderTrace.runId);
      expect(run.verdict.runId).toBe(builderTrace.runId);
    }
  });

  it('every curated verdict anchors stepId to a REAL step of that builder trace (invariant × 7)', () => {
    for (const cat of CATEGORIES) {
      const run = sampleRun(cat);
      expect(run.verdict.compromised).toBe(true);
      expect(run.verdict.stepId).toBeDefined();
      const ids = run.trace.steps.map((s) => s.id);
      expect(ids).toContain(run.verdict.stepId);
      // the anchored step is an observable offending action (a tool_call)
      const step = run.trace.steps.find((s) => s.id === run.verdict.stepId);
      expect(step?.type).toBe('tool_call');
    }
  });

  it('GUARDRAIL: assembling samples never reads groundTruth (spy, same as the detector)', async () => {
    gtReads.clear();
    await ds.listRuns();
    await ds.getRun('sample');
    for (const cat of CATEGORIES) sampleRun(cat);
    expect([...gtReads]).toEqual([]);
  });

  it('leakage barrier: no sample fixture leaks a held-out label anywhere in its graph', async () => {
    const runs = await ds.listRuns();
    for (const fixture of [...runs, leaderboardFixture, findingsFixture]) {
      expect(hasKeyDeep(fixture, 'groundTruth')).toBe(false);
    }
    for (const run of runs) {
      for (const step of run.trace.steps) {
        expect(hasKeyDeep(step, 'label')).toBe(false);
        expect(hasKeyDeep(step, 'compromiseFlag')).toBe(false);
      }
    }
  });

  it('getRun resolves by canonical id and the "sample" alias, null otherwise', async () => {
    const asi06 = sampleRun('ASI06');
    expect(SAMPLE_RUN_ID).toBe(asi06.runId);
    expect(await ds.getRun(SAMPLE_RUN_ID)).toEqual(asi06);
    expect(await ds.getRun('sample')).toEqual(asi06);
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
    const report = await ds.getFixReport(SAMPLE_RUN_ID);
    expect(report?.runId).toBe(SAMPLE_RUN_ID);
    expect(report?.remediation).toHaveLength(5);
    expect(await ds.getFixReport('nope')).toBeNull();
  });

  it('getFleetStatus tallies the leaderboard into a provenance-aware tri-state', async () => {
    const fleet = await ds.getFleetStatus();
    expect(fleet).toEqual({
      source: 'sample',
      nominal: 4,
      caution: 7,
      breach: 4,
      total: 15,
      empty: false,
    });
    expect(fleet.nominal + fleet.caution + fleet.breach).toBe(fleet.total);
  });
});
