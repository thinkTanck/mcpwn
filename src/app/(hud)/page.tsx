import Link from 'next/link';
import { SentinelCore } from '@/components/hud';
import { CountUp } from '@/components/home/CountUp';
import { Core7List } from '@/components/home/Core7List';
import { SampleTrailer } from '@/components/home/SampleTrailer';
import { getDataSource } from '@/data/source';
import type { RunResult, Step } from '@/contract';

/**
 * Home — the BRAND-register front door. The pitch + the measured-detector claim
 * + the Core-7 launcher + the sample trailer, composed to fit ONE viewport.
 *
 * Everything about the featured run is BOUND to the real sample `RunResult`
 * (run id, step total, compromise step) — no `RG-0472`/`/13` literals. The
 * precision/recall figures are a leakage-separated FIXTURE, labelled as such,
 * not a claimed product benchmark.
 */

/**
 * Illustrative, leakage-separated FIXTURE metrics for the hero stat. NOT measured
 * product accuracy and NOT a benchmark — the honest provenance is rendered beside
 * them. Phase 8 replaces these with recorded validated-judge results.
 */
const SAMPLE_METRICS = { precision: 0.94, recall: 0.89 } as const;

/** Human-readable one-liner for a trace step (for the trailer end labels). */
function stepLabel(step: Step): string {
  switch (step.type) {
    case 'attacker':
      return 'attacker prompt';
    case 'agent_reasoning':
      return 'agent reasoning';
    case 'tool_call':
      return `${step.tool} call`;
    case 'tool_result':
      return `${step.tool} result`;
    case 'memory_read':
      return 'memory read';
    case 'memory_write':
      return 'memory write';
    case 'task_complete':
      return 'complete';
  }
}

/** Resolve the compromise step (1-based index + offending tool) from the verdict. */
function compromise(run: RunResult): { index: number; tool: string } {
  const steps = run.trace.steps;
  const index = steps.findIndex((s) => s.id === run.verdict.stepId) + 1;
  const step = steps[index - 1];
  const tool = step && step.type === 'tool_call' ? step.tool : run.verdict.category;
  return { index, tool };
}

export default async function Home() {
  const ds = getDataSource();
  const [sample, runs] = await Promise.all([ds.getRun('sample'), ds.listRuns()]);
  if (!sample) throw new Error('sample run unavailable');

  const runById: Record<string, string> = Object.fromEntries(
    runs.map((r) => [r.category, r.runId]),
  );
  const runHref = (id: string) =>
    id === sample.category ? '/runs/sample' : `/runs/${runById[id] ?? 'sample'}`;

  const steps = sample.trace.steps;
  const total = steps.length;
  const first = steps[0];
  const last = steps[total - 1];
  const { index: compromiseIndex, tool: offendingTool } = compromise(sample);

  return (
    <div className="flex min-h-[calc(100dvh-62px)] items-start lg:items-center">
      <div className="mx-auto w-full max-w-[1240px] px-6 py-8">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* ── left: pitch + stat + CTAs + trailer ── */}
          <section aria-labelledby="home-title" className="flex min-w-0 flex-col gap-4">
            <h1 id="home-title" className="reading-h1 max-w-[16ch]">
              Pwn your MCP agent before an attacker does. Trust the verdict.
            </h1>

            <p className="reading-lead max-w-[52ch]">
              Bring your own MCP agent and red-team it against the OWASP Agentic Top 10.
            </p>

            <p className="reading max-w-[54ch]">
              Most tools only <span className="text-ink-muted">guess</span> whether an agent was
              compromised. We tested our detector against attacks with known outcomes and{' '}
              <span className="readout">MEASURED</span> how accurate it is, so you can trust its
              verdicts.
            </p>

            {/* Detector accuracy as a measured instrument READOUT, not a hero-metric
                stat pair. Provenance leads; the numbers are the focal DISPLAY values
                (they may animate as magnitudes) framed as data, not a marketing headline. */}
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="micro-label text-nominal">Detector accuracy</span>
                <span className="instrument-faint">
                  measured · leakage-separated fixture, not a benchmark
                </span>
              </div>
              <div className="flex items-baseline gap-x-6">
                <span className="whitespace-nowrap">
                  <CountUp value={SAMPLE_METRICS.precision} className="display-lg font-sans" />
                  <span className="instrument ml-2">precision</span>
                </span>
                <span className="whitespace-nowrap">
                  <CountUp value={SAMPLE_METRICS.recall} className="display-lg font-sans" />
                  <span className="instrument ml-2">recall</span>
                </span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-5">
                <Link
                  href="/runs/sample"
                  className="inline-flex items-center gap-2 rounded-md border border-nominal bg-nominal/10 px-6 py-3 font-mono text-[13px] tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                  Play ASI06 sample
                </Link>
                <Link
                  href="/connect"
                  className="font-mono text-[13px] tracking-[0.06em] text-nominal hover:underline"
                >
                  Connect your agent →
                </Link>
              </div>
              <p className="instrument-faint">
                Featured run: memory poisoning. Pick any of the Core-7 to watch its own attack.
              </p>
            </div>

            <SampleTrailer
              runId={sample.runId}
              total={total}
              compromiseIndex={compromiseIndex}
              offendingTool={offendingTool}
              firstLabel={first ? stepLabel(first) : ''}
              lastLabel={last ? stepLabel(last) : ''}
              watchHref="/runs/sample"
            />
          </section>

          {/* ── right: sentinel core well + Core-7 launcher ── */}
          <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8">
            <div className="relative flex aspect-[4/3] max-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-line bg-[radial-gradient(120%_120%_at_50%_40%,color-mix(in_srgb,var(--cyan-700)_16%,transparent),var(--surface-base)_70%)]">
              <SentinelCore
                size={200}
                label="Sentinel core — the detector reads only the observable trace"
                className="relative z-10"
              />
              <svg
                viewBox="0 0 560 560"
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              >
                <ellipse
                  cx="280"
                  cy="280"
                  rx="212"
                  ry="74"
                  transform="rotate(20 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1.1"
                  opacity="0.4"
                />
                <ellipse
                  cx="280"
                  cy="280"
                  rx="150"
                  ry="204"
                  transform="rotate(-14 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1.1"
                  opacity="0.28"
                />
                <ellipse
                  cx="280"
                  cy="280"
                  rx="118"
                  ry="196"
                  transform="rotate(62 280 280)"
                  className="fill-none stroke-nominal"
                  strokeWidth="1"
                  opacity="0.2"
                />
              </svg>
              <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-line-em bg-base/70 px-2.5 py-1.5">
                <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                  <circle
                    cx="8"
                    cy="8"
                    r="6.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    className="text-nominal"
                  />
                  <circle cx="8" cy="8" r="2" fill="currentColor" className="text-nominal" />
                </svg>
                <span className="micro-label !tracking-[0.1em] text-nominal">Leakage barrier</span>
              </div>
            </div>

            <Core7List runHref={runHref} />
          </div>
        </div>
      </div>
    </div>
  );
}
