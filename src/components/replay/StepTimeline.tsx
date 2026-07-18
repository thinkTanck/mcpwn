'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Step } from '@/contract';
import { stepMeta, stepSummary, type NodeBand } from './step-meta';

/**
 * The typed-node step timeline: the reliable base that renders everywhere (SSR,
 * reduced-motion, no-WebGL) and the mobile form. Horizontal rail on desktop, a
 * vertical rail on mobile — same nodes, same mechanics. The 3D OrbitalCore is a
 * desktop enhancement layered over this by Replay; this component is what the
 * transport always drives and what a blind reader can always operate.
 *
 * Colour is one of three channels, never alone: each node carries a glyph + a
 * mono tag, the active node is ringed, and the compromise node is badged BREACH.
 *
 * Node hover/focus shows a step tooltip. It is rendered through a body PORTAL
 * with `position: fixed`, so it escapes the shell's `overflow-x: clip` and is
 * never clipped at the deck edge (a node near the rail edge still shows its tip).
 */

function bandDot(band: NodeBand, breach: boolean): string {
  if (breach) return 'bg-breach shadow-glow-breach';
  if (band === 'nominal') return 'bg-nominal shadow-glow-nominal';
  if (band === 'caution') return 'bg-caution shadow-glow-caution';
  return 'bg-ink-muted';
}

type Tip = { x: number; y: number; text: string; breach: boolean };

export function StepTimeline({
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
    <ol
      aria-label="Attack replay step timeline"
      className={cn(
        'flex min-w-0 gap-2',
        'flex-col lg:h-full lg:flex-row lg:items-stretch lg:justify-between lg:gap-1',
      )}
    >
      {steps.map((step, i) => {
        const meta = stepMeta(step.type);
        const breach = i === compromiseIndex;
        const active = i === current;
        const reached = i <= current;
        return (
          <li key={step.id} className="min-w-0 lg:flex lg:flex-1 lg:flex-col">
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${meta.label}${breach ? ', compromise step' : ''}`}
              onClick={() => onSelect(i)}
              onMouseEnter={(e) => showTip(e.currentTarget, i, breach)}
              onFocus={(e) => showTip(e.currentTarget, i, breach)}
              onMouseLeave={() => setTip(null)}
              onBlur={() => setTip(null)}
              className={cn(
                'group flex w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors lg:h-full lg:flex-col lg:items-center lg:justify-start lg:gap-2 lg:px-2 lg:py-3',
                active
                  ? 'border-line-em bg-nominal/[0.06]'
                  : 'border-transparent hover:border-line hover:bg-nominal/[0.03]',
                !reached && 'opacity-45',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1',
                  breach ? 'ring-breach/50' : active ? 'ring-nominal/50' : 'ring-line',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-0 rounded-full opacity-20',
                    bandDot(meta.band, breach),
                  )}
                />
                <svg width="15" height="15" viewBox="0 0 16 16" className="relative">
                  <path
                    d={meta.glyph}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      breach
                        ? 'text-breach-text'
                        : meta.band === 'nominal'
                          ? 'text-nominal'
                          : meta.band === 'caution'
                            ? 'text-caution'
                            : 'text-ink',
                    )}
                  />
                </svg>
              </span>
              <span className="flex min-w-0 flex-col lg:items-center lg:text-center">
                <span className="font-mono text-[12px] tracking-[0.02em] text-ink-faint">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'truncate font-mono text-[12px] uppercase tracking-[0.08em] lg:max-w-[7rem]',
                    breach ? 'text-breach-text' : 'text-ink-muted',
                  )}
                >
                  {breach ? 'BREACH' : meta.tag}
                </span>
              </span>
            </button>
          </li>
        );
      })}

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
    </ol>
  );
}
