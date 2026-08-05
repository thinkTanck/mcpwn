'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A value the user has to move OUT of this screen and into their agent: the run
 * endpoint, the run token, the task goal.
 *
 * Two type roles, picked per value and not by taste. An endpoint or a token is
 * TELEMETRY — a machine string, so it wears the INSTRUMENT role (mono readout).
 * The task goal is a SENTENCE A HUMAN READS before pasting it, so it wears the
 * READING role. Prose never renders at instrument size on this screen, which is
 * a blocking rule rather than a preference.
 *
 * ── SECRETS ──
 *
 * `secret` masks the value on screen while still copying the real one. The mask
 * is a CONSTANT, not derived from the value, so it cannot leak the length. This
 * is not encryption and does not pretend to be: the point is that a screen-shared
 * or shoulder-surfed Connect page does not spill a live credential, while the one
 * legitimate use (paste it into your agent) still works in a single click.
 *
 * There is deliberately no `<input>` here. A form control is what a password
 * manager or an autofill store latches onto, and the run token must not be
 * persisted by anything, the browser included.
 */
export function CopyOut({
  label,
  value,
  name,
  secret = false,
  tone = 'readout',
}: {
  /** INSTRUMENT label above the value. */
  label: string;
  value: string;
  /** What this value is, in words, for the control names: e.g. "run token". */
  name: string;
  secret?: boolean;
  /** `readout` = mono telemetry. `prose` = a sentence a human reads. */
  tone?: 'readout' | 'prose';
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyFailed(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing is echoed and nothing reaches a log: the user is told to select
      // the text, which is on screen anyway once revealed.
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const hidden = secret && !revealed;

  return (
    <div className="rounded-lg border border-line bg-panel/60 px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="micro-label">{label}</span>
        <div className="flex items-center gap-2">
          {copied && (
            <span className="instrument text-nominal" role="status">
              COPIED
            </span>
          )}
          {secret && (
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-pressed={revealed}
              aria-label={`${revealed ? 'Hide' : 'Reveal'} ${name}`}
              className="min-h-11 rounded-md border border-line px-3.5 py-2 font-mono text-[13px] tracking-[0.06em] text-ink-muted transition-colors hover:border-line-em hover:text-ink"
            >
              {revealed ? 'HIDE' : 'REVEAL'}
            </button>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${name}`}
            className="min-h-11 rounded-md border border-line-em px-3.5 py-2 font-mono text-[13px] tracking-[0.06em] text-nominal transition-colors hover:bg-nominal/10"
          >
            COPY
          </button>
        </div>
      </div>
      {hidden ? (
        <p className="readout break-all text-ink-faint" aria-hidden="true">
          {MASK}
        </p>
      ) : (
        <p className={cn('break-words', tone === 'prose' ? 'reading' : 'readout break-all')}>
          {value}
        </p>
      )}
      {copyFailed && (
        <p className="reading mt-2 text-ink-muted">
          Copying did not work in this browser. Reveal the value and select it by hand.
        </p>
      )}
    </div>
  );
}

/** A constant mask. Derived from nothing, so it reveals nothing, not even length. */
const MASK = '•'.repeat(44);
