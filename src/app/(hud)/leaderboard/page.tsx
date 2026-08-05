import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionLabel } from '@/components/hud';
import { InertMark, LeaderboardHeatmap } from '@/components/leaderboard';
import { getDataSource, SAMPLE_RUN_ID } from '@/data/source';
import { getRunRepository } from '@/data/run-repository.factory';
import { measuredLeaderboard } from '@/leaderboard/measured';
import { getUser } from '@/lib/auth/user';

export const metadata: Metadata = {
  title: 'Robustness Leaderboard · MCPwn',
  description:
    'Per-model, per-category robustness. Measured runs only, with an empty board while none exist.',
};

/**
 * ROBUSTNESS LEADERBOARD (route `/leaderboard`, register: PRODUCT).
 *
 * Server component. TWO boards, and keeping them apart is the whole design:
 *
 *  1. MEASURED — built by module 5 from the runs this account has actually
 *     persisted, read owner-scoped through `RunRepository`. Nobody has produced
 *     a multi-model campaign yet (plan.md B4), so what this ships as is an
 *     EMPTY board with the reason stated. An empty leaderboard that says why is
 *     worth more than a full one implying work nobody did.
 *  2. FIXTURE — the placeholder campaign, kept only to show the aggregation and
 *     the colour language working end to end. It is framed, labelled and
 *     subordinate, and every one of its cells carries `state: 'fixture'`.
 *
 * NO NUMBER ON THIS SCREEN IS INVENTED OR BORROWED. Every value is computed by
 * `buildLeaderboard` from run verdicts. The detector's published precision,
 * recall and classification accuracy are deliberately absent: they measure the
 * JUDGE, not any model's resistance, and reusing them here would manufacture a
 * robustness figure out of an unrelated measurement.
 */
export default async function LeaderboardPage() {
  const ds = getDataSource();
  const [fixture, sampleRuns, user] = await Promise.all([
    ds.getLeaderboard(),
    ds.listRuns(),
    getUser(),
  ]);

  // Owner-scoped: a leaderboard is only ever built from runs the caller owns.
  const stored = user ? await (await getRunRepository()).listRuns(user.id) : [];
  const measured = measuredLeaderboard(stored.map((row) => row.run));

  // category id → sample run id (from the DataSource, never a literal). Applies
  // to the fixture board only: the replay route serves the sample library, so a
  // measured cell has no run of its own to open yet.
  const runIdByCategory: Record<string, string> = {};
  for (const run of sampleRuns) runIdByCategory[run.category] = run.runId;

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="type-flow mx-auto max-w-[1600px] px-6 py-10 sm:py-12"
    >
      <SectionLabel>Robustness Leaderboard</SectionLabel>
      <h1 id="leaderboard-heading" className="reading-h1 mt-3">
        Model &times; category.
      </h1>
      <p className="reading mt-4 max-w-[72ch]">
        Robustness is the share of a model&apos;s runs in a category that ended not compromised, as
        called by the locked validated judge. Higher is safer, 1.00 means the model resisted every
        run it faced, and OVERALL is run-weighted across the whole row rather than an average of the
        cells. A pair with no runs behind it reads No data, never zero, because zero would say the
        model was compromised every time.
      </p>

      <h2 className="reading-h2 mt-10">Measured runs</h2>
      {measured.rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-line bg-panel px-6 py-8">
          <p
            className="micro-label flex items-center gap-2"
            style={{ color: 'var(--status-inert)' }}
          >
            <InertMark />
            No measurement yet
          </p>
          <p className="reading mt-3 max-w-[72ch]">
            No model has been measured. This board is built from live runs on this account, and
            there are none, so it has nothing to report. Nothing here is filled in from somewhere
            else: the detector&apos;s published precision and recall describe the judge that reads a
            trace, not any model&apos;s resistance to an attack.
          </p>
          <p className="reading mt-3 text-ink-muted">
            {user
              ? 'Rows appear one model at a time as your runs complete.'
              : 'Sign in to see your own measured runs here.'}
          </p>
          <Link
            href="/connect"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-nominal bg-nominal/10 px-5 font-mono text-[14px] tracking-[0.06em] text-readout transition-colors hover:bg-nominal/20"
          >
            Connect your agent →
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          <LeaderboardHeatmap leaderboard={measured} />
        </div>
      )}

      <h2 className="reading-h2 mt-12">Fixture demonstration</h2>
      <p className="reading mt-3 max-w-[72ch]">
        The board below is placeholder data. Model A, B and C are not products and the runs behind
        them were never executed, so no cell in it is a result. It is here because the aggregation
        and the colour language are real and worth showing: every value in it is computed from run
        verdicts by the same code the measured board uses.
      </p>
      {/* One quiet inert frame, not a second bordered panel competing with the
          empty state above it: a soft inert hairline and a faint wash, so the
          board inside is legibly cordoned off without shouting. */}
      <div
        className="mt-4 rounded-lg border p-4 sm:p-5"
        style={{
          borderColor: 'color-mix(in srgb, var(--status-inert) 40%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--status-inert) 4%, transparent)',
        }}
      >
        <p
          className="micro-label mb-4 flex items-center gap-2"
          style={{ color: 'var(--status-inert)' }}
        >
          <InertMark />
          Fixture · not a measurement
        </p>
        <LeaderboardHeatmap
          leaderboard={fixture}
          drillIn={{ runIdByCategory, fallbackRunId: SAMPLE_RUN_ID }}
        />
      </div>
    </section>
  );
}
