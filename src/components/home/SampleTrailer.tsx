import Link from 'next/link';

/**
 * The SAMPLE RUN strip (the trailer): a dot-per-step timeline with the compromise
 * step badged breach, plus the anchor readouts. Every value here is BOUND to the
 * real sample `RunResult` by the caller (run id, step total, compromise index +
 * offending tool) — never a literal. Status is glow PLUS the "breach" label +
 * icon, never colour alone.
 */
export function SampleTrailer({
  runId,
  total,
  compromiseIndex,
  offendingTool,
  firstLabel,
  lastLabel,
  watchHref,
}: {
  runId: string;
  total: number;
  compromiseIndex: number;
  offendingTool: string;
  firstLabel: string;
  lastLabel: string;
  watchHref: string;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const steps = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <section aria-label="Sample run trailer" className="border-t border-line pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-em bg-nominal/5 px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.12em] text-nominal shadow-glow-nominal">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-nominal" />
            Sample run
          </span>
          <span className="instrument">
            <span className="text-readout">{runId}</span> · memory poisoning to external
            exfiltration · {total} steps
          </span>
        </div>
        {/* Ghost link, not a second filled primary: the hero "Play ASI06 sample"
            button is the single dominant CTA; this affordance sits on the labelled
            sample strip and only needs to read as clickable, not compete. */}
        <Link
          href={watchHref}
          aria-label="Watch the ASI06 sample replay"
          className="inline-flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] text-nominal transition-colors hover:underline"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <polygon points="2,1 11,6 2,11" fill="currentColor" />
          </svg>
          Watch replay
        </Link>
      </div>

      {/* Dot strip — one dot per real step; the compromise dot is badged. */}
      <div
        className="relative flex items-center justify-between"
        role="img"
        aria-label={`Step timeline: ${total} steps, compromise at step ${compromiseIndex}`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line"
        />
        {steps.map((n) => {
          const breach = n === compromiseIndex;
          return (
            <span
              key={n}
              data-testid="trailer-dot"
              data-breach={breach ? 'true' : 'false'}
              aria-hidden="true"
              className={
                breach
                  ? 'relative z-10 h-3 w-3 rounded-full bg-breach shadow-glow-breach ring-2 ring-breach/40'
                  : 'relative z-10 h-1.5 w-1.5 rounded-full bg-nominal/60'
              }
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[12px] tracking-[0.04em] text-ink-faint">
        <span>
          {pad(1)} · {firstLabel}
        </span>
        <span className="text-breach-text">
          {pad(compromiseIndex)} · {offendingTool} breach
        </span>
        <span>
          {pad(total)} · {lastLabel}
        </span>
      </div>
    </section>
  );
}
