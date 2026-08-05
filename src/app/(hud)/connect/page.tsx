import type { Metadata } from 'next';
import { finishLiveRun, getLiveRunStatus, startLiveRun } from '@/app/actions/live-run';
import { ConnectScreen, type SampleRunIds } from '@/components/connect/ConnectScreen';
import { CategorySchema } from '@/contract';
import { SAMPLE_VERDICT_PROVENANCE } from '@/data/fixtures/sample-verdicts';
import { sampleRun } from '@/data/source';
import { getUser } from '@/lib/auth/user';

export const metadata: Metadata = {
  title: 'Connect / Run Setup · MCPwn',
  description:
    'Set up a red-team run: watch a recorded sample, or point your own MCP agent at an endpoint we host for a live run. The detector is fixed, blind, and locked.',
};

/**
 * Connect / Run Setup route.
 *
 * The console itself is a Client Component, so this server route resolves the
 * three things it cannot know on its own:
 *
 *   1. THE REAL SESSION. Live runs are gated; sample playback is not.
 *   2. WHICH RECORDED RUN each category plays, so the sample launch goes to the
 *      run the user actually picked rather than always to the hero one.
 *   3. WHAT THE SAMPLE IS, in the sample library's own provenance words. A
 *      constructed demonstration must never travel without that label.
 *
 * ── THE LIVE PORT IS BOUND HERE, AND ONLY HERE ──
 *
 * The screen is coded against `ConnectLiveRunPort`
 * (`src/components/connect/live-run-port.ts`), and this route is the ONE place
 * the real server actions are attached to it. The three actions go down as
 * props; `ConnectScreen` adapts them through `createConnectLiveRunPort` and the
 * console never learns the server's shape.
 *
 * The actions are passed rather than imported by the client component because
 * `@/app/actions/live-run` is a `'use server'` module: importing it from the
 * browser bundle is not a thing, and a Server Component handing an action down
 * as a prop is how Next intends the boundary to be crossed. None of them takes a
 * `userId` — the account is read from the session on the server, so the browser
 * cannot name an account at all.
 */
export default async function ConnectPage() {
  const user = await getUser();

  const sampleRunIds: SampleRunIds = Object.fromEntries(
    CategorySchema.options.map((category) => [category, sampleRun(category).runId]),
  );

  return (
    <ConnectScreen
      signedIn={user !== null}
      sampleRunIds={sampleRunIds}
      sampleProvenance={SAMPLE_VERDICT_PROVENANCE}
      liveActions={{
        start: startLiveRun,
        status: getLiveRunStatus,
        finish: finishLiveRun,
      }}
    />
  );
}
