import { RunResultSchema, type Category } from '@/contract';
import { bandFor } from '@/lib/hud/bands';
import { buildLeaderboard } from '@/leaderboard';
import { CORE7_AXIS, CORE7_TITLES } from '@/leaderboard/axis';
import { toLeaderboardView } from '@/leaderboard/view';
import {
  LEADERBOARD_FIXTURE_CAMPAIGN,
  leaderboardFixture,
  leaderboardFixtureRuns,
} from '@/data/fixtures/leaderboard';

/** Every fixture cell has runs behind it, so every one of them is scored. */
const fixtureCells = () =>
  leaderboardFixture.rows.flatMap((r) => r.cells).map((c) => ({ ...c, robustness: c.robustness! }));

/**
 * The leaderboard the screen renders is DERIVED: fixture run verdicts go into
 * the real module 5 aggregator, and what comes out is what is displayed. These
 * tests hold that line, because the failure mode they guard is a quiet revert
 * to a hand-typed table of ratios that no aggregation ever produced.
 *
 * The runs themselves stay FIXTURES. No per-model robustness has been measured
 * (plan.md B4), so the campaign below is a placeholder input, labelled
 * `source: 'fixture'` all the way to the UI.
 */
describe('leaderboard fixture — real aggregation over placeholder runs', () => {
  it('expands the declared campaign into contract-valid, unlabeled RunResults', () => {
    const runs = leaderboardFixtureRuns();
    const declared = LEADERBOARD_FIXTURE_CAMPAIGN.reduce((n, c) => n + c.runs, 0);
    expect(runs).toHaveLength(declared);
    for (const run of runs) expect(() => RunResultSchema.parse(run)).not.toThrow();
    // Unlabeled by construction: a RunResult carries no held-out ground truth.
    expect(runs.some((r) => 'groundTruth' in r)).toBe(false);
  });

  it('anchors every compromised fixture verdict to a step that exists in its trace', () => {
    for (const run of leaderboardFixtureRuns()) {
      if (!run.verdict.compromised) {
        expect(run.verdict.stepId).toBeUndefined();
        continue;
      }
      expect(run.trace.steps.map((s) => s.id)).toContain(run.verdict.stepId);
    }
  });

  it('shows the ratio the aggregator computed, recounted independently from the runs', () => {
    const runs = leaderboardFixtureRuns();
    for (const row of leaderboardFixture.rows) {
      for (const cell of row.cells) {
        const forCell = runs.filter((r) => r.model === row.model && r.category === cell.category);
        const resisted = forCell.filter((r) => !r.verdict.compromised).length;
        expect(forCell.length).toBeGreaterThan(0);
        expect(cell.robustness).toBeCloseTo(resisted / forCell.length, 10);
      }
      const forModel = runs.filter((r) => r.model === row.model);
      const resisted = forModel.filter((r) => !r.verdict.compromised).length;
      expect(row.overall).toBeCloseTo(resisted / forModel.length, 10);
    }
  });

  it('is the aggregator output, not a table typed alongside it', () => {
    expect(leaderboardFixture).toEqual(
      toLeaderboardView(buildLeaderboard(leaderboardFixtureRuns()), {
        titles: CORE7_TITLES,
        categories: CORE7_AXIS,
        source: 'fixture',
      }),
    );
  });

  it('stamps EVERY cell as a fixture, so no single cell can travel as a result', () => {
    for (const row of leaderboardFixture.rows) {
      expect(row.state).toBe('fixture');
      for (const cell of row.cells) expect(cell.state).toBe('fixture');
    }
  });

  it('labels its provenance as a fixture and covers the full Core-7 matrix', () => {
    expect(leaderboardFixture.source).toBe('fixture');
    expect(leaderboardFixture.categories.map((c) => c.id)).toEqual([
      'ASI01',
      'ASI02',
      'ASI03',
      'ASI04',
      'ASI05',
      'ASI06',
      'ASI10',
    ]);
    for (const c of leaderboardFixture.categories) expect(c.full).not.toBe(c.id);
    expect(leaderboardFixture.rows).toHaveLength(3);
    for (const row of leaderboardFixture.rows) expect(row.cells).toHaveLength(7);
  });

  it('keeps a single weakest cell so the screen has one unambiguous focal point', () => {
    const cells = fixtureCells();
    const min = Math.min(...cells.map((c) => c.robustness));
    expect(cells.filter((c) => c.robustness === min)).toHaveLength(1);
    expect(bandFor(min)).toBe('breach');
  });

  it('exercises all three bands so the tri-state legend is not decorative', () => {
    const bands = new Set(fixtureCells().map((c) => bandFor(c.robustness)));
    expect([...bands].sort()).toEqual(['breach', 'caution', 'nominal']);
  });

  it('declares a whole-number resisted count within the runs of each campaign cell', () => {
    const seen = new Set<string>();
    for (const cell of LEADERBOARD_FIXTURE_CAMPAIGN) {
      const key = `${cell.model}/${cell.category satisfies Category}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(Number.isInteger(cell.resisted)).toBe(true);
      expect(cell.resisted).toBeGreaterThanOrEqual(0);
      expect(cell.resisted).toBeLessThanOrEqual(cell.runs);
    }
  });
});
