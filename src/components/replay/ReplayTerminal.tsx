'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hud/reduced-motion';
import { stepMeta } from './step-meta';
import type { Step } from '@/contract';

/**
 * The live agent-transcript terminal — the replay hero. Each observable step is a
 * terminal line showing the run's real input/output (attacker prompt, agent
 * reasoning, tool call + args, tool result, memory read/write, the closing
 * summary). As the playhead advances, the active line TYPES IN like a streaming
 * console and the view scrolls to it; reached lines stay bright, steps ahead sit
 * dim and queued. This replaces the Sentinel orbital/step-counter entirely.
 *
 * Parity with the timeline it replaces: the lines are a real <ol> of labelled
 * <button>s (aria-current on the active line, the compromise line badged in its
 * name), so clicking a line scrubs to that step and the replay tests + a11y
 * contract are unchanged.
 *
 * The typed length is a rendering effect only — it derives from the playhead
 * position (a magnitude); the payload TEXT is the trace verbatim and never
 * changes. Under prefers-reduced-motion the active line appears complete at once.
 */

type Tone = 'attacker' | 'agent' | 'tool' | 'memory' | 'done';
type Entry = { prompt: string; sep: string; text: string; tone: Tone };

function compact(v: unknown): string {
  let s: string;
  if (typeof v === 'string') s = v;
  else {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 220 ? `${s.slice(0, 219)}…` : s;
}

function entryFor(step: Step): Entry {
  switch (step.type) {
    case 'attacker':
      return { prompt: 'usr', sep: '❯', text: step.content, tone: 'attacker' };
    case 'agent_reasoning':
      return { prompt: 'llm', sep: '❯', text: step.content, tone: 'agent' };
    case 'tool_call':
      return {
        prompt: 'llm',
        sep: '→',
        text: `call ${step.tool}(${compact(step.args)})`,
        tone: 'tool',
      };
    case 'tool_result':
      return {
        prompt: 'sys',
        sep: '←',
        text: `${step.tool} ⇒ ${compact(step.result)}`,
        tone: 'tool',
      };
    case 'memory_read':
      return {
        prompt: 'mem',
        sep: '←',
        text: `read ${step.key} ⇒ ${compact(step.value)}`,
        tone: 'memory',
      };
    case 'memory_write':
      return {
        prompt: 'mem',
        sep: '→',
        text: `write ${step.key} = ${compact(step.value)}`,
        tone: 'memory',
      };
    case 'task_complete':
      return { prompt: 'end', sep: '✓', text: step.summary ?? 'run complete', tone: 'done' };
  }
}

function toneColor(tone: Tone, breach: boolean): string {
  if (breach) return 'var(--status-breach)';
  switch (tone) {
    case 'attacker':
      return 'var(--status-caution)';
    case 'agent':
      return 'var(--text-readout)';
    case 'tool':
      return 'var(--status-nominal)';
    case 'memory':
      return 'var(--line-emphasis)';
    case 'done':
      return 'var(--status-caution)';
  }
}

export function ReplayTerminal({
  steps,
  current,
  compromiseIndex,
  playing = false,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  playing?: boolean;
  onSelect: (index: number) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const entries = useMemo(() => steps.map(entryFor), [steps]);
  const [typed, setTyped] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const activeRef = useRef<HTMLLIElement>(null);

  // Typewriter for the active line. setState runs only inside rAF callbacks, so
  // this never trips react-hooks/set-state-in-effect.
  useEffect(() => {
    const full = entries[current]?.text.length ?? 0;
    if (reduced) {
      const raf = requestAnimationFrame(() => setTyped({ i: current, n: full }));
      return () => cancelAnimationFrame(raf);
    }
    let raf = 0;
    const t0 = performance.now();
    const cps = 280; // characters per second
    const tick = (t: number) => {
      const n = Math.min(full, Math.round(((t - t0) / 1000) * cps));
      setTyped({ i: current, n });
      if (n < full) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [current, reduced, entries]);

  // Keep the active line in view as the transcript streams. Guarded because
  // jsdom (unit tests) does not implement scrollIntoView.
  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [current, reduced]);

  const visibleText = (i: number): string => {
    if (i < current) return entries[i]!.text;
    if (i === current) return typed.i === current ? entries[i]!.text.slice(0, typed.n) : '';
    return '';
  };

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-solid"
      style={{ height: 'clamp(300px, 42vh, 480px)' }}
    >
      {/* Terminal title bar. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-breach/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-caution/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-nominal/70" />
        </span>
        <span className="font-mono text-[13px] tracking-[0.16em] text-ink-faint">
          AGENT TRANSCRIPT
        </span>
        <span className="flex-1" />
        <span
          className={
            'inline-flex items-center gap-1.5 font-mono text-[13px] tracking-[0.12em] ' +
            (playing ? 'text-nominal' : 'text-ink-faint')
          }
        >
          <span
            aria-hidden="true"
            className={
              'h-1.5 w-1.5 rounded-full ' +
              (playing
                ? 'bg-nominal shadow-glow-nominal motion-safe:animate-pulse'
                : 'bg-ink-faint')
            }
          />
          {playing ? 'STREAMING' : 'PAUSED'}
        </span>
      </div>

      {/* The transcript — one line per step; the operable step timeline. */}
      <ol
        aria-label="Attack replay step timeline"
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 py-3 font-mono text-[14px] leading-relaxed"
      >
        {steps.map((step, i) => {
          const meta = stepMeta(step.type);
          const entry = entries[i]!;
          const breach = i === compromiseIndex;
          const active = i === current;
          const reached = i <= current;
          const col = toneColor(entry.tone, breach);
          return (
            <li key={step.id} ref={active ? activeRef : undefined}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${meta.label}${breach ? ', compromise step' : ''}`}
                onClick={() => onSelect(i)}
                className={
                  'grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-sm px-2 py-1 text-left transition-colors hover:bg-nominal/[0.05] focus:outline-none focus-visible:bg-nominal/[0.08] ' +
                  (active ? 'bg-nominal/[0.06]' : '')
                }
              >
                {/* Prompt tag — tri-state coloured, dim until reached. */}
                <span
                  className="tabular-nums tracking-[0.04em] whitespace-nowrap"
                  style={{
                    color: reached ? col : 'var(--text-pending)',
                    opacity: reached ? 1 : 0.6,
                  }}
                >
                  <span className="text-ink-faint">{String(i + 1).padStart(2, '0')}</span>{' '}
                  {entry.prompt}
                  <span aria-hidden="true"> {entry.sep}</span>
                </span>
                {/* Payload text — streams in on the active line. */}
                <span
                  className="break-words"
                  style={{
                    color: breach
                      ? 'var(--text-breach)'
                      : reached
                        ? 'var(--text)'
                        : 'var(--text-pending)',
                  }}
                >
                  {visibleText(i)}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-[1.05em] w-[0.5ch] translate-y-[0.15em] motion-safe:animate-pulse"
                      style={{ background: col }}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
