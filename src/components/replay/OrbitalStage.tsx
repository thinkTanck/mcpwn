'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, stepSummary } from './step-meta';
import { ReplayCore } from './ReplayCore';

/**
 * The orbital replay stage: a tri-state particle core (ReplayCore) at the centre,
 * 13 typed nodes placed AROUND a ring by trig (so numbers never collide), a sweep
 * line that rotates to the active step, and a centred STEP numeral over the core.
 * This is the Sentinel v2 hero.
 *
 * Node colour follows the design's per-type map, expressed in DTCG tokens:
 * attacker → ink, agent → ink-muted, tool → nominal, memory → line-emphasis,
 * complete → caution, breach → breach. The core carries the same tri-state by
 * latitude (cyan body / amber band / red cap).
 *
 * Accessibility: the nodes are a real <ol> of labelled <button>s (aria-current on
 * the active one, the compromise node badged) — the operable control a blind
 * reader always has. SVG + 2D canvas + CSS transforms only; no WebGL.
 */

const R = 44; // node-ring radius as a % of the plate

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

export function OrbitalStage({
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
  const sweepDeg = (current / total) * 360 - 180;

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
    <div className="relative mx-auto aspect-square" style={{ width: 'min(100%, 480px, 56vh)' }}>
      {/* Particle core — the luminous centre, behind the numeral. */}
      <div className="pointer-events-none absolute inset-[22%]">
        <ReplayCore className="h-full w-full" />
      </div>

      {/* Outer ring — hairline + dashed cyan graticule ticks. */}
      <svg viewBox="0 0 560 560" className="pointer-events-none absolute inset-0 h-full w-full">
        <circle cx="280" cy="280" r="248" fill="none" stroke="var(--line)" strokeWidth="1" />
        <circle
          cx="280"
          cy="280"
          r="248"
          fill="none"
          stroke="var(--line-emphasis)"
          strokeWidth="1"
          strokeDasharray="1 9"
          opacity="0.7"
        />
      </svg>

      {/* Sweep line — rotates to the active step. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 origin-top transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: '2px',
          height: `${R}%`,
          transform: `rotate(${sweepDeg}deg)`,
          background:
            'linear-gradient(180deg, transparent 30%, color-mix(in srgb, var(--status-nominal) 70%, transparent))',
        }}
      />

      {/* Nodes around the ring. */}
      <ol aria-label="Attack replay step timeline" className="absolute inset-0">
        {steps.map((step, i) => {
          const meta = stepMeta(step.type);
          const breach = i === compromiseIndex;
          const activeNode = i === current;
          const reached = i <= current;
          const a = (i / total) * 2 * Math.PI - Math.PI / 2;
          const left = 50 + R * Math.cos(a);
          const top = 50 + R * Math.sin(a);
          const size = breach ? 16 : 11;
          const col = nodeColor(step.type, breach);
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
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-md p-1"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <span
                  className={cn(
                    'rounded-full transition-all',
                    breach && reached && 'animate-pulse',
                  )}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    background: dotBg,
                    boxShadow: reached
                      ? `0 0 10px color-mix(in srgb, ${col} 55%, transparent)`
                      : 'none',
                    border: activeNode ? '2px solid var(--text-readout)' : '2px solid transparent',
                  }}
                />
                <span
                  className="font-mono text-[14px] tabular-nums tracking-[0.04em]"
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

      {/* Centre — STEP / numeral / head, in a dark radial pill over the core. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-9 py-6 text-center"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--surface-base) 82%, transparent) 45%, transparent)',
        }}
      >
        <div className="font-mono text-[12px] tracking-[0.18em] text-ink-muted">STEP</div>
        <div
          className="font-sans font-bold leading-none tabular-nums"
          style={{
            fontSize: 'clamp(56px, 12vw, 76px)',
            letterSpacing: '-0.03em',
            color: numColor,
            textShadow: `0 0 22px ${numGlow}`,
          }}
        >
          {String(current + 1).padStart(2, '0')}
        </div>
        <div
          className="mt-1 font-mono text-[13px] tracking-[0.06em]"
          style={{ color: activeBreach ? 'var(--text-breach)' : 'var(--text-muted)' }}
        >
          {activeBreach ? `${activeMeta.tag} · BREACH` : activeMeta.label}
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
              'pointer-events-none z-50 max-w-[15rem] rounded-md border bg-solid px-2.5 py-1.5 font-mono text-[12px] leading-snug shadow-glow-nominal',
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
