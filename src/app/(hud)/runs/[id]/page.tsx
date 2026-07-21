import type { Metadata } from 'next';
import Link from 'next/link';
import { getDataSource } from '@/data/source';
import { Replay } from '@/components/replay';

export const metadata: Metadata = {
  title: 'Live Attack Replay · MCPwn',
  description:
    'Step through an attack run around the 3D orbital core: typed nodes, the compromise step badged, and the detector rationale pinned to it.',
};

/**
 * Live Attack Replay (route `/runs/[id]`, register: PRODUCT, the hero). Server
 * component: resolves the run through the DataSource and hands the observable
 * RunResult to the client Replay. Falls back to the curated sample so a
 * leaderboard drill-down or a stale link never 404s.
 */
export default async function RunReplay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ds = getDataSource();
  const run = (await ds.getRun(id)) ?? (await ds.getRun('sample'));

  if (!run) {
    return (
      <section
        aria-label="Live Attack Replay"
        className="mx-auto max-w-[720px] px-6 py-16 text-center"
      >
        <p className="micro-label text-nominal">Live Attack Replay</p>
        <h1 className="reading-h2 mt-3">No run to replay.</h1>
        <p className="reading mt-3 text-ink-muted">
          There is no run for <span className="font-mono text-readout">{id}</span>. Try the sample
          run.
        </p>
        <Link
          href="/runs/sample"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-nominal bg-nominal/10 px-5 py-2.5 font-mono text-[14px] tracking-[0.06em] text-readout shadow-glow-nominal"
        >
          Play the sample run
        </Link>
      </section>
    );
  }

  return <Replay run={run} />;
}
