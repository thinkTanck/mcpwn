'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Verdict } from '@/contract';

/**
 * The detector verdict, rendered as a second terminal (same rules as the
 * transcript: bare console, one colour, breach-red for the compromise facts). It
 * prints the verdict summary — outcome, category, severity, offending step — then
 * an interactive `export fix report? [y/n]` prompt: `y` opens the engineer-ready
 * fix report (/findings/[id]); `n` prints `ok` and stays. There is no rationale
 * prose; the summary is the whole of it.
 *
 * `y` is a real <Link> (accessible name "Export fix report") so the fix-report
 * off-ramp stays keyboard- and screen-reader-operable; typing y/n while either
 * export control has focus does the same thing.
 */
const CYAN = 'var(--text-readout)';
const BREACH = 'var(--text-breach)';
const PROMPT = 'detector@sentinel:~';

function Row({ k, v, breachValue }: { k: string; v: string; breachValue?: boolean }) {
  return (
    <div className="whitespace-pre-wrap" style={{ color: CYAN }}>
      <span style={{ opacity: 0.85 }}>{k.padEnd(11, ' ')}</span>
      <span style={{ color: breachValue ? BREACH : CYAN }}>{v}</span>
    </div>
  );
}

export function VerdictRail({
  verdict,
  compromiseStepNumber,
  offendingLabel,
}: {
  verdict: Verdict;
  /** 1-based step number of verdict.stepId, or null if the run is clean. */
  compromiseStepNumber: number | null;
  /** Tool/label of the offending step, e.g. "send_email". */
  offendingLabel?: string;
}) {
  const href = `/findings/${verdict.runId}`;
  const compromised = verdict.compromised;
  const [answered, setAnswered] = useState<null | 'n'>(null);
  const yRef = useRef<HTMLAnchorElement>(null);

  // Type y/n while either export control is focused, like a real prompt. `y`
  // triggers the link itself (no router dependency, so it renders under test).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      yRef.current?.click();
    } else if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      setAnswered('n');
    }
  };

  return (
    <aside
      aria-label="Detector verdict"
      className="overflow-y-auto rounded-lg px-4 py-3 font-mono text-[15px] leading-[1.6]"
      style={{ height: 'clamp(280px, 40vh, 460px)', background: 'var(--terminal-bg)', color: CYAN }}
    >
      <div style={{ opacity: 0.85 }}>
        {PROMPT}$ verdict --run {verdict.runId}
      </div>
      <Row
        k="outcome"
        v={compromised ? 'COMPROMISED' : 'NOT COMPROMISED'}
        breachValue={compromised}
      />
      <Row k="category" v={verdict.category} />
      <Row k="severity" v={verdict.severity.toUpperCase()} breachValue={compromised} />
      {compromised && compromiseStepNumber !== null && (
        <Row
          k="offending"
          v={`#${compromiseStepNumber}${offendingLabel ? ` ${offendingLabel}` : ''}`}
          breachValue
        />
      )}

      {/* Interactive export prompt. */}
      <div className="mt-3 whitespace-pre-wrap">
        <span style={{ opacity: 0.85 }}>{PROMPT}$ </span>
        export fix report? [
        <Link
          ref={yRef}
          href={href}
          aria-label="Export fix report"
          onKeyDown={onKey}
          className="underline-offset-2 hover:underline focus:underline focus:outline-none"
          style={{ color: CYAN }}
        >
          y
        </Link>
        /
        <button
          type="button"
          onClick={() => setAnswered('n')}
          onKeyDown={onKey}
          aria-label="Decline export"
          className="underline-offset-2 hover:underline focus:underline focus:outline-none"
          style={{ color: CYAN }}
        >
          n
        </button>
        ]
        {answered === null && (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-[1.05em] w-[0.55ch] translate-y-[0.18em] motion-safe:[animation:cursor-blink_1.05s_step-end_infinite]"
            style={{ background: CYAN }}
          />
        )}
      </div>
      {answered === 'n' && <div style={{ color: CYAN }}>&gt; ok</div>}
    </aside>
  );
}
