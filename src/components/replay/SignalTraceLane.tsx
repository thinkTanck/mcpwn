'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, stepSummary } from './step-meta';

/**
 * The signal-trace lane: a left-to-right oscilloscope reading of the run. The 13
 * typed nodes sit on a horizontal graticule at a height set by their tri-state
 * band (breach spikes highest), a glowing waveform connects the steps REACHED so
 * far, and a vertical playhead sweeps across to the active step. This replaces the
 * Sentinel orbital: a step SEQUENCE reads best as a line, and a line never lets 13
 * numerals collide the way a ring does.
 *
 * Motion budget: the playhead moves by `translateX` in container-query units
 * (`cqw` = 1% of the lane's inline size) so it is a pure GPU transform with no
 * width measurement and no sibling reflow; the reached waveform + active pulse are
 * opacity/scale only. `prefers-reduced-motion` is honoured by the caller-level
 * media query on the transition (see the `motion-reduce` utility below).
 *
 * Accessibility parity with the orbital it replaces: the nodes remain a real <ol>
 * of labelled <button>s (aria-current on the active one, the compromise node
 * badged in its name), which the replay tests assert against and which is the
 * operable control a blind reader always has. SVG + CSS only, no WebGL.
 *
 * The STEP position (a magnitude) may tick; identifiers never do.
 */

const PAD = 6; // horizontal inset of the node track, as a % of the lane width
const BAND_Y: Record<'breach' | 'caution' | 'nominal' | 'neutral', number> = {
  breach: 24,
  caution: 40,
  nominal: 55,
  neutral: 69,
};

function nodeColor(type: Step['type'], breach: boolean): string {
  if (breach) return 'var(--status-breach)';
  switch (type) {
    case 'attacker':
      return 'var(--text)';
    case 'agent_reasoning':
      return 'var(--text-muted)';
    case 'tool_call':
    case 'tool_result':
      return 'var(--status-nominal)';
    case 'memory_read':
    case 'memory_write':
      return 'var(--line-emphasis)';
    case 'task_complete':
      return 'var(--status-caution)';
    default:
      return 'var(--text-muted)';
  }
}

type Tip = { x: number; y: number; text: string; breach: boolean };

export function SignalTraceLane({
  steps,
  current,
  compromiseIndex,
  onSelect,
}: {
  steps: Step[];
  current: number;
  compromiseIndex: number;
  onSelect: (index: number) => void;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const total = steps.length;
  const active = steps[current]!;
  const activeMeta = stepMeta(active.type);
  const activeBreach = current === compromiseIndex;

  const span = 100 - 2 * PAD;
  const xPct = (i: number) => (total <= 1 ? 50 : PAD + (i / (total - 1)) * span);
  const colW = total <= 1 ? span : span / (total - 1);
  const yFor = (i: number) =>
    BAND_Y[i === compromiseIndex ? 'breach' : stepMeta(steps[i]!.type).band];

  const numColor = activeBreach
    ? 'var(--text-breach)'
    : active.type === 'task_complete'
      ? 'var(--status-caution)'
      : 'var(--text-readout)';
  const numGlow = activeBreach
    ? 'color-mix(in srgb, var(--status-breach) 50%, transparent)'
    : active.type === 'task_complete'
      ? 'color-mix(in srgb, var(--status-caution) 42%, transparent)'
      : 'color-mix(in srgb, var(--status-nominal) 42%, transparent)';

  // Waveform paths: a dim full baseline and a bright glowing overlay through the
  // steps reached so far (0..current). Straight segments read as a signal trace.
  const pt = (i: number) => `${xPct(i).toFixed(2)} ${yFor(i).toFixed(2)}`;
  const dimD = steps.map((_, i) => `${i === 0 ? 'M' : 'L'} ${pt(i)}`).join(' ');
  const brightD = steps
    .slice(0, current + 1)
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${pt(i)}`)
    .join(' ');

  const showTip = (el: HTMLElement, i: number, breach: boolean) => {
    const r = el.getBoundingClientRect();
    setTip({
      x: r.left + r.width / 2,
      y: r.top,
      text: `${String(i + 1).padStart(2, '0')} · ${stepSummary(steps[i]!)}`,
      breach,
    });
  };

  return (
    <div className="w-full" style={{ containerType: 'inline-size' }}>
      {/* Instrument readout — the STEP magnitude + the active step's identity. */}
      <div className="mb-4 flex items-end justify-between gap-6 px-1">
        <div>
          <div className="font-mono text-[13px] tracking-[0.18em] text-ink-muted">STEP</div>
          <div
            className="font-sans font-bold leading-none tabular-nums"
            style={{
              fontSize: 'clamp(40px, 7vw, 56px)',
              letterSpacing: '-0.03em',
              color: numColor,
              textShadow: `0 0 22px ${numGlow}`,
            }}
          >
            {String(current + 1).padStart(2, '0')}
            <span className="text-ink-faint" style={{ fontSize: '0.42em' }}>
              {' '}
              / {String(total).padStart(2, '0')}
            </span>
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div
            className="truncate font-mono text-[14px] tracking-[0.06em]"
            style={{ color: activeBreach ? 'var(--text-breach)' : 'var(--text-muted)' }}
          >
            {activeBreach ? `${activeMeta.tag} · BREACH` : activeMeta.label}
          </div>
          <div className="truncate font-mono text-[13px] text-ink-faint">{stepSummary(active)}</div>
        </div>
      </div>

      {/* The lane — graticule, waveform, nodes, and the sweeping playhead. */}
      <div
        className="relative w-full overflow-hidden rounded-lg border border-line bg-panel"
        style={{ height: 'clamp(220px, 30vh, 300px)' }}
      >
        {/* Graticule — hairline vertical ticks at each node x + a centre rule. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            opacity="0.4"
          />
          {steps.map((s, i) => (
            <line
              key={s.id}
              x1={xPct(i)}
              y1="8"
              x2={xPct(i)}
              y2="92"
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              opacity="0.18"
            />
          ))}
        </svg>

        {/* Waveform — dim full baseline + bright glowing reached overlay. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            d={dimD}
            fill="none"
            stroke="var(--line-emphasis)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            opacity="0.55"
          />
          <path
            d={brightD}
            fill="none"
            stroke="var(--status-nominal)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{
              filter:
                'drop-shadow(0 0 3px color-mix(in srgb, var(--status-nominal) 70%, transparent))',
            }}
          />
        </svg>

        {/* Nodes — one tall hit-column per step (dot on the waveform, numeral on
            the axis). Real <ol> of <button>s for a11y + the replay tests. */}
        <ol aria-label="Attack replay step timeline" className="absolute inset-0">
          {steps.map((step, i) => {
            const meta = stepMeta(step.type);
            const breach = i === compromiseIndex;
            const activeNode = i === current;
            const reached = i <= current;
            const col = nodeColor(step.type, breach);
            const size = breach ? 15 : 10;
            const dotBg = reached ? col : 'color-mix(in srgb, var(--ink-muted) 32%, transparent)';
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={activeNode ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${meta.label}${breach ? ', compromise step' : ''}`}
                  onClick={() => onSelect(i)}
                  onMouseEnter={(e) => showTip(e.currentTarget, i, breach)}
                  onFocus={(e) => showTip(e.currentTarget, i, breach)}
                  onMouseLeave={() => setTip(null)}
                  onBlur={() => setTip(null)}
                  className="absolute top-0 bottom-0 -translate-x-1/2 rounded-sm focus:outline-none focus-visible:bg-nominal/[0.06]"
                  style={{ left: `${xPct(i)}%`, width: `${colW}%` }}
                >
                  {/* Dot on the waveform vertex. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all',
                      breach && reached && 'animate-pulse',
                    )}
                    style={{
                      top: `${yFor(i)}%`,
                      width: `${size}px`,
                      height: `${size}px`,
                      background: dotBg,
                      boxShadow: reached
                        ? `0 0 10px color-mix(in srgb, ${col} 55%, transparent)`
                        : 'none',
                      border: activeNode
                        ? '2px solid var(--text-readout)'
                        : '2px solid transparent',
                    }}
                  />
                  {/* Numeral on the bottom axis. */}
                  <span
                    aria-hidden="true"
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[13px] tabular-nums tracking-[0.04em]"
                    style={{
                      color: activeNode
                        ? 'var(--text-readout)'
                        : reached
                          ? 'var(--text-muted)'
                          : 'var(--text-pending)',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Playhead — a vertical sweep that translates in container-query units
            (pure GPU transform). A cap diamond marks its head; the step number is
            carried by the readout above and the active axis numeral below. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 w-px transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            left: 0,
            transform: `translateX(${xPct(current).toFixed(2)}cqw)`,
            background: activeBreach
              ? 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--status-breach) 65%, transparent) 18%, color-mix(in srgb, var(--status-breach) 65%, transparent) 82%, transparent)'
              : 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--status-nominal) 65%, transparent) 18%, color-mix(in srgb, var(--status-nominal) 65%, transparent) 82%, transparent)',
            boxShadow: activeBreach
              ? '0 0 8px color-mix(in srgb, var(--status-breach) 55%, transparent)'
              : '0 0 8px color-mix(in srgb, var(--status-nominal) 55%, transparent)',
          }}
        >
          <span
            className="absolute top-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45"
            style={{ background: activeBreach ? 'var(--status-breach)' : 'var(--status-nominal)' }}
          />
        </div>
      </div>

      {tip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: tip.x,
              top: tip.y - 10,
              transform: 'translate(-50%, -100%)',
            }}
            className={cn(
              'pointer-events-none z-50 max-w-[15rem] rounded-md border bg-solid px-2.5 py-1.5 font-mono text-[13px] leading-snug shadow-glow-nominal',
              tip.breach ? 'border-breach/50 text-breach-text' : 'border-line-em text-readout',
            )}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
