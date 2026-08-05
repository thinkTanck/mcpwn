import type { Metadata } from 'next';
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
 * ── THE LIVE PORT IS DELIBERATELY UNBOUND HERE ──
 *
 * The screen is coded against `ConnectLiveRunPort`
 * (`src/components/connect/live-run-port.ts`), and this route is the ONE place a
 * real implementation is bound to it. The live-run server action is built
 * separately, so nothing is passed yet and the console falls back to its
 * not-wired port, which refuses plainly and issues nothing. That is the same
 * discipline `resolveLiveDetector()` follows for an unconfigured judge: an
 * unwired path is a fact about this build, stated, not a screen pretending.
 *
 * Binding it is two lines here plus the adapter's two structural action types:
 *
 *   const livePort = createConnectLiveRunPort({ start: startLiveRun, readState: readLiveRunState });
 *   return <ConnectScreen livePort={livePort} ... />;
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
    />
  );
}
