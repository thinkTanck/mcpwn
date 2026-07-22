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
  model,
  runId,
  category,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  playing?: boolean;
  model: string;
  runId: string;
  category: string;
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
      className="flex flex-col overflow-hidden rounded-lg border border-line-em"
      style={{ height: 'clamp(360px, 52vh, 580px)', background: 'var(--terminal-bg)' }}
    >
      {/* Window chrome — traffic lights + the shell path title. */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-line px-3.5 py-2"
        style={{ background: 'var(--terminal-chrome)' }}
      >
        <span aria-hidden="true" className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-breach/80" />
          <span className="h-3 w-3 rounded-full bg-caution/80" />
          <span className="h-3 w-3 rounded-full bg-nominal/80" />
        </span>
        <span className="flex-1 truncate text-center font-mono text-[13px] tracking-[0.02em] text-ink-muted">
          {model}@sentinel: ~/runs/{runId}
        </span>
        {/* Balances the traffic lights so the title stays optically centred. */}
        <span aria-hidden="true" className="w-[52px] shrink-0" />
      </div>

      {/* The transcript — one flat line per step; the operable step timeline. */}
      <ol
        aria-label="Attack replay step timeline"
        className="min-h-0 flex-1 overflow-y-auto py-2 font-mono text-[14px] leading-[1.55]"
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
                  'grid w-full grid-cols-[auto_auto_minmax(0,1fr)] gap-x-2 px-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--status-nominal)_7%,transparent)] focus:outline-none focus-visible:bg-[color-mix(in_srgb,var(--status-nominal)_12%,transparent)] ' +
                  (active ? 'bg-[color-mix(in_srgb,var(--status-nominal)_7%,transparent)]' : '')
                }
              >
                {/* Line gutter — faint, like `less -N`. */}
                <span
                  aria-hidden="true"
                  className="select-none pr-1 text-right tabular-nums text-ink-faint"
                  style={{ opacity: reached ? 0.65 : 0.32 }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Shell prompt — role + direction glyph, tri-state coloured. */}
                <span
                  className="tabular-nums whitespace-nowrap"
                  style={{
                    color: reached ? col : 'var(--text-pending)',
                    opacity: reached ? 1 : 0.5,
                  }}
                >
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
                    opacity: reached ? 1 : 0.5,
                  }}
                >
                  {visibleText(i)}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="ml-px inline-block h-[1.05em] w-[0.55ch] translate-y-[0.18em] motion-safe:[animation:cursor-blink_1.05s_step-end_infinite]"
                      style={{ background: col }}
                    />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Status line — tmux/vim style: mode on the left, position on the right. */}
      <div
        className="flex shrink-0 items-center gap-3 border-t border-line px-3.5 py-1.5 font-mono text-[13px] tracking-[0.08em]"
        style={{ background: 'var(--terminal-chrome)' }}
      >
        <span
          className={
            'inline-flex items-center gap-1.5 ' + (playing ? 'text-nominal' : 'text-ink-muted')
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
          {playing ? '-- STREAMING --' : '-- PAUSED --'}
        </span>
        <span className="flex-1" />
        <span className="text-ink-faint">{category}</span>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <span className="tabular-nums text-ink-muted">
          LN <span className="text-readout">{String(current + 1).padStart(2, '0')}</span>/
          {String(steps.length).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
