import Link from 'next/link';
import { SentinelCore } from '@/components/hud';
import { Core7List } from '@/components/home/Core7List';
import { SampleTrailer } from '@/components/home/SampleTrailer';
import { getDataSource } from '@/data/source';
import { offendingStepLabel } from '@/lib/hud/trace-view';
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
 * MEASURED detector accuracy — leakage-separated, taken verbatim from a real
 * `npm run eval:measure` run and never rounded or adjusted.
 *
 * Precision 0.9565 is 22/23: 22 true positives and one false positive across the
 * whole labeled set. Recall 1.0000 is 22/22 with ZERO false negatives, in every
 * category, on all five passes — the detector did not miss a single real
 * compromise. The only error is an over-flag.
 *
 * The judge that produced this is FROZEN (`docs/adr/0009-compromise-vs-exposure.md`):
 * `claude-haiku-4-5`, temperature 0, and the `SYSTEM_RUBRIC` constant as it
 * stands. The number holds for that configuration and no other, which is why the
 * provenance below names the judge as well as the date.
 *
 * REPLACING THESE: re-run `npm run eval:measure` (five passes, modal verdict per
 * realization) and take the aggregate verbatim. The figures and `METRICS_PROVENANCE`
 * move together or not at all — a measured figure with no provenance is the same
 * untrustworthy claim as an invented one, and `tests/unit/app/home.test.tsx`
 * fails if they are ever separated.
 */
const DETECTOR_METRICS = { precision: 0.9565, recall: 1.0 } as const;

/**
 * How the figures above were obtained. Rendered beside them, never apart from
 * them. Five passes agreed on all 44 realizations, so there is no instability
 * caveat to carry; if a future run disagrees on any, this line has to say so.
 */
const METRICS_PROVENANCE =
  'measured · N=44 labeled realizations · 5 passes · 2026-08-03 · judge claude-haiku-4-5';

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

/** Resolve the compromise step (1-based index + offending step name) from the verdict. */
function compromise(run: RunResult): { index: number; tool: string } {
  const steps = run.trace.steps;
  const index = steps.findIndex((s) => s.id === run.verdict.stepId) + 1;
  const step = steps[index - 1];
  return { index, tool: step ? offendingStepLabel(step) : run.verdict.category };
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
      <div className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.3fr_0.8fr] lg:gap-10">
          {/* ── left: pitch + stat + CTAs + trailer ── */}
          <section aria-labelledby="home-title" className="flex min-w-0 flex-col gap-4">
            <h1 id="home-title" className="reading-h1 max-w-[22ch]">
              Pwn your MCP agent before an attacker does. Trust the verdict.
            </h1>

            <p className="reading-lead">
              Bring your own MCP agent and red-team it against the OWASP Agentic Top 10.
            </p>

            <p className="reading">
              Most tools only <span className="text-ink-muted">guess</span> whether an agent was
              compromised. We tested our detector against attacks with known outcomes and{' '}
              <span className="font-semibold text-nominal">measured</span> how accurate it is, so
              you can trust its verdicts.
            </p>

            {/* Detector accuracy readout. Provenance leads; the numbers render at their FINAL
                value immediately (SSR + client), NEVER counting up: this claim is the evidence
                of the core promise, so a transient "0.00 precision" would assert the opposite. */}
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="micro-label text-nominal">Detector accuracy</span>
                <span className="instrument-faint">{METRICS_PROVENANCE}</span>
              </div>
              <div className="flex items-baseline gap-x-6">
                <span className="whitespace-nowrap">
                  <span className="display-lg font-sans">
                    {DETECTOR_METRICS.precision.toFixed(2)}
                  </span>
                  <span className="instrument ml-2">precision</span>
                </span>
                <span className="whitespace-nowrap">
                  <span className="display-lg font-sans">{DETECTOR_METRICS.recall.toFixed(2)}</span>
                  <span className="instrument ml-2">recall</span>
                </span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-5">
                <Link
                  href="/runs/sample"
                  className="inline-flex items-center gap-2 rounded-md border border-nominal bg-nominal/10 px-6 py-3 font-mono text-[14px] tracking-[0.08em] text-readout shadow-glow-nominal transition-colors hover:bg-nominal/20"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                  Play ASI06 sample
                </Link>
                <Link
                  href="/connect"
                  className="font-mono text-[14px] tracking-[0.06em] text-nominal hover:underline"
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
                label="Sentinel core: the detector reads only the observable trace"
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
            </div>

            <Core7List runHref={runHref} />
          </div>
        </div>
      </div>
    </div>
  );
}
