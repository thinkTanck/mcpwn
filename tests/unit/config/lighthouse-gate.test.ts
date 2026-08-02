import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The CWV gate's own contract, locked in a test instead of in a comment.
 *
 * Three things kept going wrong with `lighthouserc.json` and none of them were
 * visible from reading it:
 *
 *   1. It measured ONE route (`/`) while CLAUDE.md claimed "Core Web Vitals good
 *      @ p75" for the whole app. Six screens shipped unmeasured.
 *   2. It aggregated with lhci's `optimistic` default, i.e. best-of-N, which is
 *      how a flaky ~0.22 CLS once passed ([ADR-0008](../../../docs/adr/0008-cwv-gate-measures-five-runs-and-asserts-the-median.md)).
 *   3. Nothing stopped a red budget being nudged upward until it went green.
 *
 * (3) is the one worth a test: a threshold is only honest if raising it is a
 * deliberate, reviewable act. So the ceilings from CLAUDE.md's Performance
 * clause (LCP <= 2500ms, CLS <= 0.1) are asserted here as HARD CAPS. A per-route
 * budget may be tighter than the ceiling (and several are, because the route
 * measures well below it), never looser. Loosening past the ceiling fails this
 * test, which forces the conversation into a PR diff.
 *
 * Per-route numbers live in `docs/perf/cwv.md`.
 */

type Assertion = [level: string, options?: { minScore?: number; maxNumericValue?: number }];
type MatrixEntry = {
  matchingUrlPattern: string;
  aggregationMethod?: string;
  assertions: Record<string, Assertion>;
};
type Lighthouserc = {
  ci: {
    collect: { url: string[]; numberOfRuns: number; settings: { throttlingMethod: string } };
    assert: { assertMatrix: MatrixEntry[]; aggregationMethod?: string; assertions?: unknown };
  };
};

// Vitest runs from the repo root (vitest.config.ts sits there), so the gate
// config is read from the real file the CI step reads — not a copy of it.
const rc: Lighthouserc = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lighthouserc.json'), 'utf8'),
);

/**
 * Every route CLAUDE.md lists under "Routes", with a real fixture id where the
 * segment is dynamic (`sample` resolves through the in-memory DataSource, so
 * both render fully offline with no creds). `/account` is deliberately absent:
 * signed out it renders the same gate as `/sign-in`.
 */
const ROUTES = [
  'http://localhost:3000/',
  'http://localhost:3000/sign-in',
  'http://localhost:3000/connect',
  'http://localhost:3000/runs/sample',
  'http://localhost:3000/leaderboard',
  'http://localhost:3000/findings/sample',
  'http://localhost:3000/threats',
];

/** CLAUDE.md's Performance clause. These are ceilings, not suggestions. */
const CEILING = { lcp: 2500, cls: 0.1 };

describe('lighthouserc.json — what the CWV gate measures', () => {
  it('audits every route in the app, not just Home', () => {
    expect([...rc.ci.collect.url].sort()).toEqual([...ROUTES].sort());
  });

  it('measures at least five runs per route (CLAUDE.md: five is the standard)', () => {
    expect(rc.ci.collect.numberOfRuns).toBeGreaterThanOrEqual(5);
  });

  it('measures with real throttling, never a Lantern estimate (ADR-0002)', () => {
    expect(rc.ci.collect.settings.throttlingMethod).toBe('devtools');
  });
});

describe('lighthouserc.json — how the CWV gate aggregates', () => {
  /**
   * lhci rejects `assertMatrix` alongside a top-level `assertions` /
   * `aggregationMethod` ("Cannot use assertMatrix with other options"), so the
   * median has to be restated per entry. Easy to forget on a new entry, and
   * forgetting silently falls back to the `optimistic` default.
   */
  it.each(rc.ci.assert.assertMatrix.map((e) => [e.matchingUrlPattern, e] as const))(
    'asserts the median of the runs for %s, never best-of-N',
    (_pattern, entry) => {
      expect(entry.aggregationMethod).toBe('median');
    },
  );

  it('keeps the matrix as the only source of assertions', () => {
    expect(rc.ci.assert.assertions).toBeUndefined();
    expect(rc.ci.assert.aggregationMethod).toBeUndefined();
  });

  /**
   * An unmatched URL is not an error in lhci — `getAllAssertionResultsForUrl`
   * returns `[]` for it. A route with no matching pattern would therefore be
   * collected, charted, and asserted against nothing at all: a green gate over
   * an unmeasured screen. That is exactly the hole this work closes, so it must
   * not be re-openable by a typo in a regex.
   */
  it.each(ROUTES)('holds %s to exactly one matrix entry', (url) => {
    const matched = rc.ci.assert.assertMatrix.filter((e) =>
      new RegExp(e.matchingUrlPattern).test(url),
    );
    expect(matched).toHaveLength(1);
  });
});

describe('lighthouserc.json — budgets stay at or under the CWV ceiling', () => {
  const entries = rc.ci.assert.assertMatrix.map((e) => [e.matchingUrlPattern, e] as const);

  it.each(entries)('%s fails the build on LCP and CLS, not merely warns', (_pattern, entry) => {
    expect(entry.assertions['largest-contentful-paint']?.[0]).toBe('error');
    expect(entry.assertions['cumulative-layout-shift']?.[0]).toBe('error');
  });

  it.each(entries)('%s keeps LCP at or under 2500ms', (_pattern, entry) => {
    const budget = entry.assertions['largest-contentful-paint']?.[1]?.maxNumericValue;
    expect(budget).toBeTypeOf('number');
    expect(budget).toBeLessThanOrEqual(CEILING.lcp);
  });

  it.each(entries)('%s keeps CLS at or under 0.1', (_pattern, entry) => {
    const budget = entry.assertions['cumulative-layout-shift']?.[1]?.maxNumericValue;
    expect(budget).toBeTypeOf('number');
    expect(budget).toBeLessThanOrEqual(CEILING.cls);
  });

  /**
   * Accessibility is a DoD requirement (WCAG 2.2 AA), not a performance
   * trade-off, so no route gets a discounted a11y score to make its budget fit.
   */
  it.each(entries)('%s demands a perfect Lighthouse accessibility score', (_pattern, entry) => {
    expect(entry.assertions['categories:accessibility']).toEqual(['error', { minScore: 1 }]);
  });
});
