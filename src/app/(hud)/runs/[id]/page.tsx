import { SectionLabel } from '@/components/hud';

/**
 * Live Attack Replay placeholder — keeps the "Live Replay" nav and leaderboard
 * drill-downs from 404ing. The orbital 3D replay lands in feat/replay-hero.
 */
export default async function RunReplay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <section aria-label="Live Attack Replay" className="mx-auto max-w-[1000px] px-6 py-12">
      <SectionLabel>Live Attack Replay</SectionLabel>
      <h1 className="mt-4 text-2xl font-medium text-ink-hi">Run {id}</h1>
      <p className="mt-3 font-mono text-sm text-ink-muted">
        The orbital replay — 13-step trace around the 3D core — lands in feat/replay-hero.
      </p>
    </section>
  );
}
