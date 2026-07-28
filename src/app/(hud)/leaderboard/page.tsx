import type { Metadata } from 'next';
import { SectionLabel } from '@/components/hud';
import { LeaderboardHeatmap } from '@/components/leaderboard';
import { getDataSource, SAMPLE_RUN_ID } from '@/data/source';

export const metadata: Metadata = {
  title: 'Robustness Leaderboard · MCPwn',
  description:
    'Per-model, per-category robustness heatmap built on fixture data, not a claimed benchmark.',
};

/**
 * ROBUSTNESS LEADERBOARD (route `/leaderboard`, register: PRODUCT).
 *
 * Server component: reads the model × category matrix through the DataSource
 * port and resolves a real sample run id per category, so every heatmap cell
 * drills into `/runs/<id>` without a hard-coded literal. The heatmap itself is
 * generic over `categories.length` (five in today's fixture, seven at Core-7).
 */
export default async function LeaderboardPage() {
  const ds = getDataSource();
  const [leaderboard, runs] = await Promise.all([ds.getLeaderboard(), ds.listRuns()]);

  // category id → sample run id (from the DataSource, never a literal).
  const runIdByCategory: Record<string, string> = {};
  for (const run of runs) runIdByCategory[run.category] = run.runId;

  return (
    <section
      aria-labelledby="leaderboard-heading"
      className="type-flow mx-auto max-w-[1600px] px-6 py-10 sm:py-12"
    >
      <SectionLabel>Robustness Leaderboard</SectionLabel>
      <h1 id="leaderboard-heading" className="reading-h1 mt-3">
        Model &times; category.
      </h1>
      <p className="reading mt-4">
        Robustness is the fraction of attack traces the agent left not compromised, so higher is
        safer. The numbers below are placeholder fixture data, not a claimed benchmark; each cell
        opens that run in the Live Attack Replay.
      </p>

      <div className="mt-8">
        <LeaderboardHeatmap
          leaderboard={leaderboard}
          runIdByCategory={runIdByCategory}
          fallbackRunId={SAMPLE_RUN_ID}
        />
      </div>
    </section>
  );
}
